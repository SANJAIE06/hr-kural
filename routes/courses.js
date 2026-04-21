const express = require("express");
const pool = require("../db");
const auth = require("../middleware/auth");
const { sendOTP, verifyOTP } = require("../utils/otp");
const {
  createPaymentOrder,
  verifyPaymentSignature,
  getPaymentDetails,
} = require("../utils/payment");

const router = express.Router();

// GET /api/courses — list all courses grouped by domain
router.get("/", async (req, res) => {
  try {
    const [courses] = await pool.execute(
      "SELECT c.*, COUNT(ct.id) AS topicCount FROM courses c LEFT JOIN course_topics ct ON ct.course_id = c.id GROUP BY c.id ORDER BY c.domain, c.title",
    );

    const domainMap = {};
    for (const c of courses) {
      if (!domainMap[c.domain]) domainMap[c.domain] = [];
      domainMap[c.domain].push({
        id: c.id,
        title: c.title,
        description: c.description,
        domain: c.domain,
        thumbnail: c.thumbnail,
        topicCount: c.topicCount,
      });
    }

    const domains = Object.entries(domainMap).map(([name, courses]) => ({
      name,
      courses,
    }));

    res.json({ domains });
  } catch (err) {
    console.error("Courses list error:", err);
    res.status(500).json({ error: "Server error." });
  }
});

// GET /api/courses/razorpay-key — get Razorpay public key for frontend
router.get("/razorpay-key", (req, res) => {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    if (!keyId) {
      return res.status(500).json({ error: "Razorpay Key ID not configured." });
    }
    res.json({ keyId });
  } catch (err) {
    console.error("Razorpay key error:", err);
    res.status(500).json({ error: "Server error." });
  }
});

// GET /api/courses/public/:id — get public course details (no auth needed for sharing)
router.get("/public/:id", async (req, res) => {
  try {
    const [courses] = await pool.execute(
      "SELECT id, title, description, domain, thumbnail FROM courses WHERE id = ?",
      [req.params.id],
    );

    if (courses.length === 0) {
      return res.status(404).json({ error: "Course not found." });
    }

    const course = courses[0];

    // Get topic count
    const [topicCount] = await pool.execute(
      "SELECT COUNT(id) as count FROM course_topics WHERE course_id = ?",
      [req.params.id],
    );

    res.json({
      id: course.id,
      title: course.title,
      description: course.description,
      domain: course.domain,
      thumbnail: course.thumbnail,
      topicCount: topicCount[0]?.count || 0,
    });
  } catch (err) {
    console.error("Public course detail error:", err);
    res.status(500).json({ error: "Server error." });
  }
});

// GET /api/courses/my-courses — enrolled courses with progress
router.get("/my-courses", auth, async (req, res) => {
  try {
    const [userRows] = await pool.execute(
      "SELECT enrolled_courses FROM users WHERE id = ?",
      [req.user.id],
    );
    if (userRows.length === 0)
      return res.status(404).json({ error: "User not found." });

    const enrolled = userRows[0].enrolled_courses;
    if (!enrolled || !Array.isArray(enrolled) || enrolled.length === 0) {
      return res.json({ courses: [] });
    }

    const courseIds = enrolled.map((e) => e.courseId);
    const placeholders = courseIds.map(() => "?").join(",");

    const [courses] = await pool.execute(
      `SELECT c.*, COUNT(ct.id) AS totalTopics FROM courses c LEFT JOIN course_topics ct ON ct.course_id = c.id WHERE c.id IN (${placeholders}) GROUP BY c.id`,
      courseIds,
    );

    // Get completed counts
    const [progress] = await pool.execute(
      `SELECT ct.course_id, COUNT(up.id) AS completedTopics FROM user_progress up JOIN course_topics ct ON ct.id = up.topic_id WHERE up.user_id = ? AND up.completed = TRUE AND ct.course_id IN (${placeholders}) GROUP BY ct.course_id`,
      [req.user.id, ...courseIds],
    );

    const progressMap = {};
    for (const p of progress) {
      progressMap[p.course_id] = p.completedTopics;
    }

    const result = courses.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      domain: c.domain,
      thumbnail: c.thumbnail,
      totalTopics: c.totalTopics,
      completedTopics: progressMap[c.id] || 0,
    }));

    res.json({ courses: result });
  } catch (err) {
    console.error("My courses error:", err);
    res.status(500).json({ error: "Server error." });
  }
});

// GET /api/courses/:id — single course with topics + user progress
router.get("/:id", auth, async (req, res) => {
  try {
    const [courses] = await pool.execute("SELECT * FROM courses WHERE id = ?", [
      req.params.id,
    ]);
    if (courses.length === 0)
      return res.status(404).json({ error: "Course not found." });

    const course = courses[0];

    const [topics] = await pool.execute(
      "SELECT ct.*, IFNULL(up.completed, FALSE) AS completed FROM course_topics ct LEFT JOIN user_progress up ON up.topic_id = ct.id AND up.user_id = ? WHERE ct.course_id = ? ORDER BY ct.sort_order",
      [req.user.id, req.params.id],
    );

    res.json({
      id: course.id,
      title: course.title,
      description: course.description,
      domain: course.domain,
      topics: topics.map((t) => ({
        id: t.id,
        title: t.title,
        sortOrder: t.sort_order,
        youtubeUrl: t.youtube_url,
        durationMins: t.duration_mins,
        completed: !!t.completed,
      })),
    });
  } catch (err) {
    console.error("Course detail error:", err);
    res.status(500).json({ error: "Server error." });
  }
});

// POST /api/courses/enroll — send OTP for selected courses
router.post("/enroll", auth, async (req, res) => {
  try {
    const { courseIds } = req.body;
    if (!courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({ error: "Select at least one course." });
    }

    // Validate courses exist
    const placeholders = courseIds.map(() => "?").join(",");
    const [courses] = await pool.execute(
      `SELECT id FROM courses WHERE id IN (${placeholders})`,
      courseIds,
    );
    if (courses.length !== courseIds.length) {
      return res
        .status(400)
        .json({ error: "One or more selected courses are invalid." });
    }

    // Get user email
    const [userRows] = await pool.execute(
      "SELECT email FROM users WHERE id = ?",
      [req.user.id],
    );
    const email = userRows[0].email;

    await sendOTP(email, "enrollment", {
      userId: req.user.id,
      courseIds,
    });

    res.json({ message: "OTP sent to your email." });
  } catch (err) {
    console.error("Enroll error:", err);
    res.status(500).json({ error: "Failed to send OTP. Please try again." });
  }
});

// POST /api/courses/verify-enroll — verify OTP and complete enrollment
router.post("/verify-enroll", auth, async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp || otp.length !== 6) {
      return res
        .status(400)
        .json({ error: "Please enter a valid 6-digit OTP." });
    }

    const [userRows] = await pool.execute(
      "SELECT email, enrolled_courses FROM users WHERE id = ?",
      [req.user.id],
    );
    if (userRows.length === 0)
      return res.status(404).json({ error: "User not found." });

    const email = userRows[0].email;
    const otpRecord = await verifyOTP(email, otp, "enrollment");
    if (!otpRecord) {
      return res
        .status(400)
        .json({ error: "Invalid or expired OTP. Please try again." });
    }

    const payload =
      typeof otpRecord.payload === "string"
        ? JSON.parse(otpRecord.payload)
        : otpRecord.payload;
    const newCourseIds = payload.courseIds;

    // Merge with existing enrolled courses
    let enrolled = userRows[0].enrolled_courses || [];
    if (typeof enrolled === "string") enrolled = JSON.parse(enrolled);

    const existingIds = enrolled.map((e) => e.courseId);
    const toAdd = newCourseIds.filter((id) => !existingIds.includes(id));
    const now = new Date().toISOString();

    for (const id of toAdd) {
      enrolled.push({ courseId: id, enrolledAt: now });
    }

    await pool.execute("UPDATE users SET enrolled_courses = ? WHERE id = ?", [
      JSON.stringify(enrolled),
      req.user.id,
    ]);

    res.json({
      message: "Enrollment successful!",
      enrolledCourses: enrolled,
    });
  } catch (err) {
    console.error("Verify enroll error:", err);
    res.status(500).json({ error: "Server error. Please try again." });
  }
});

// POST /api/courses/initiate-payment — create Razorpay order for enrollment
router.post("/initiate-payment", auth, async (req, res) => {
  try {
    const { courseIds } = req.body;
    if (!courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({ error: "Select at least one course." });
    }

    // Validate courses exist
    const placeholders = courseIds.map(() => "?").join(",");
    const [courses] = await pool.execute(
      `SELECT id, title FROM courses WHERE id IN (${placeholders})`,
      courseIds,
    );
    if (courses.length !== courseIds.length) {
      return res
        .status(400)
        .json({ error: "One or more selected courses are invalid." });
    }

    // Get user details
    const [userRows] = await pool.execute(
      "SELECT id, email, first_name, last_name FROM users WHERE id = ?",
      [req.user.id],
    );
    if (userRows.length === 0)
      return res.status(404).json({ error: "User not found." });

    const user = userRows[0];

    // Create Razorpay order for Rs.1 (100 paise) per course
    const courseCount = courseIds.length;
    const amount = courseCount * 1; // Rs.1 per course
    const courseNames = courses.map((c) => c.title).join(", ");

    const paymentResult = await createPaymentOrder(amount, "INR", {
      userId: user.id,
      courseIds: courseIds.join(","),
      courseNames: courseNames,
      courseCount: courseCount,
    });

    if (!paymentResult.success) {
      return res.status(500).json({ error: paymentResult.error });
    }

    // Store payment session temporarily (or you can use session storage)
    // For now, we'll send the order details to frontend
    res.json({
      orderId: paymentResult.orderId,
      amount: paymentResult.amount,
      currency: paymentResult.currency,
      userEmail: user.email,
      userName: `${user.first_name} ${user.last_name}`,
      courseIds: courseIds,
    });
  } catch (err) {
    console.error("Initiate payment error:", err);
    res
      .status(500)
      .json({ error: "Failed to initiate payment. Please try again." });
  }
});

// POST /api/courses/verify-payment — verify Razorpay payment and send OTP
router.post("/verify-payment", auth, async (req, res) => {
  try {
    const { orderId, paymentId, signature, courseIds } = req.body;

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ error: "Missing payment details." });
    }

    // Verify Razorpay signature
    const isValidSignature = verifyPaymentSignature({
      orderId,
      paymentId,
      signature,
    });

    if (!isValidSignature) {
      return res.status(400).json({
        error: "Invalid payment signature. Payment verification failed.",
      });
    }

    // Fetch payment details from Razorpay to ensure payment is successful
    const paymentDetails = await getPaymentDetails(paymentId);
    if (!paymentDetails.success || paymentDetails.status !== "captured") {
      return res
        .status(400)
        .json({ error: "Payment not successful. Please try again." });
    }

    // Get user email
    const [userRows] = await pool.execute(
      "SELECT email FROM users WHERE id = ?",
      [req.user.id],
    );
    if (userRows.length === 0)
      return res.status(404).json({ error: "User not found." });

    const email = userRows[0].email;

    // Send OTP for enrollment with payment ID included
    await sendOTP(email, "enrollment", {
      userId: req.user.id,
      courseIds: courseIds,
      paymentId: paymentId,
      orderId: orderId,
    });

    res.json({
      message: "Payment verified! OTP sent to your email.",
      paymentId: paymentId,
    });
  } catch (err) {
    console.error("Verify payment error:", err);
    res
      .status(500)
      .json({ error: "Payment verification failed. Please try again." });
  }
});

// POST /api/courses/verify-enroll — verify OTP and complete enrollment (modified to include payment)
router.post("/verify-enroll-payment", auth, async (req, res) => {
  try {
    const { otp, paymentId } = req.body;

    if (!otp || otp.length !== 6) {
      return res
        .status(400)
        .json({ error: "Please enter a valid 6-digit OTP." });
    }

    if (!paymentId) {
      return res.status(400).json({ error: "Payment ID is required." });
    }

    const [userRows] = await pool.execute(
      "SELECT email, enrolled_courses FROM users WHERE id = ?",
      [req.user.id],
    );
    if (userRows.length === 0)
      return res.status(404).json({ error: "User not found." });

    const email = userRows[0].email;
    const otpRecord = await verifyOTP(email, otp, "enrollment");
    if (!otpRecord) {
      return res
        .status(400)
        .json({ error: "Invalid or expired OTP. Please try again." });
    }

    const payload =
      typeof otpRecord.payload === "string"
        ? JSON.parse(otpRecord.payload)
        : otpRecord.payload;

    // Verify payment ID matches
    if (payload.paymentId !== paymentId) {
      return res
        .status(400)
        .json({ error: "Payment ID mismatch. Please try again." });
    }

    const newCourseIds = payload.courseIds;

    // Merge with existing enrolled courses
    let enrolled = userRows[0].enrolled_courses || [];
    if (typeof enrolled === "string") enrolled = JSON.parse(enrolled);

    const existingIds = enrolled.map((e) => e.courseId);
    const toAdd = newCourseIds.filter((id) => !existingIds.includes(id));
    const now = new Date().toISOString();

    for (const id of toAdd) {
      enrolled.push({
        courseId: id,
        enrolledAt: now,
        paymentId: paymentId,
      });
    }

    await pool.execute("UPDATE users SET enrolled_courses = ? WHERE id = ?", [
      JSON.stringify(enrolled),
      req.user.id,
    ]);

    res.json({
      message: "Enrollment successful! Payment received.",
      enrolledCourses: enrolled,
    });
  } catch (err) {
    console.error("Verify enroll with payment error:", err);
    res.status(500).json({ error: "Server error. Please try again." });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// WEBINAR REGISTRATION ENDPOINTS (HR Professionals Webinar)
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/courses/register-webinar — register for webinar (initiate payment)
router.post("/register-webinar", auth, async (req, res) => {
  try {
    // Get user details
    const [userRows] = await pool.execute(
      "SELECT id, email, first_name, last_name FROM users WHERE id = ?",
      [req.user.id],
    );
    if (userRows.length === 0)
      return res.status(404).json({ error: "User not found." });

    const user = userRows[0];

    // Create Razorpay order for ₹9 for webinar registration
    const amount = 9; // Rs.9 for webinar
    const webinarName = "Webinar for Aspiring HR Professionals";

    const paymentResult = await createPaymentOrder(amount, "INR", {
      userId: user.id,
      webinarName: webinarName,
      registrationType: "webinar",
    });

    if (!paymentResult.success) {
      return res.status(500).json({ error: paymentResult.error });
    }

    res.json({
      orderId: paymentResult.orderId,
      amount: paymentResult.amount,
      currency: paymentResult.currency,
      userEmail: user.email,
      userName: `${user.first_name} ${user.last_name}`,
      webinarName: webinarName,
    });
  } catch (err) {
    console.error("Webinar registration error:", err);
    res.status(500).json({
      error: "Failed to initiate webinar registration. Please try again.",
    });
  }
});

// POST /api/courses/verify-webinar-payment — verify Razorpay payment for webinar and send OTP
router.post("/verify-webinar-payment", auth, async (req, res) => {
  try {
    const { orderId, paymentId, signature } = req.body;

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ error: "Missing payment details." });
    }

    // Verify Razorpay signature
    const isValidSignature = verifyPaymentSignature({
      orderId,
      paymentId,
      signature,
    });

    if (!isValidSignature) {
      return res.status(400).json({
        error: "Invalid payment signature. Payment verification failed.",
      });
    }

    // Fetch payment details from Razorpay
    const paymentDetails = await getPaymentDetails(paymentId);
    if (!paymentDetails.success || paymentDetails.status !== "captured") {
      return res
        .status(400)
        .json({ error: "Payment not successful. Please try again." });
    }

    // Get user email
    const [userRows] = await pool.execute(
      "SELECT email FROM users WHERE id = ?",
      [req.user.id],
    );
    if (userRows.length === 0)
      return res.status(404).json({ error: "User not found." });

    const email = userRows[0].email;

    // Send OTP for webinar registration with payment ID
    await sendOTP(email, "webinar_enrollment", {
      userId: req.user.id,
      paymentId: paymentId,
      orderId: orderId,
      webinarName: "Webinar for Aspiring HR Professionals",
    });

    res.json({
      message: "Payment verified! OTP sent to your email.",
      paymentId: paymentId,
    });
  } catch (err) {
    console.error("Webinar payment verification error:", err);
    res.status(500).json({
      error: "Payment verification failed. Please try again.",
    });
  }
});

// POST /api/courses/verify-webinar-enrollment — verify OTP and complete webinar registration
router.post("/verify-webinar-enrollment", auth, async (req, res) => {
  try {
    const { otp, paymentId } = req.body;

    if (!otp || otp.length !== 6) {
      return res
        .status(400)
        .json({ error: "Please enter a valid 6-digit OTP." });
    }

    if (!paymentId) {
      return res.status(400).json({ error: "Payment ID is required." });
    }

    const [userRows] = await pool.execute(
      "SELECT email, first_name FROM users WHERE id = ?",
      [req.user.id],
    );
    if (userRows.length === 0)
      return res.status(404).json({ error: "User not found." });

    const email = userRows[0].email;

    // Verify OTP
    const otpRecord = await verifyOTP(email, otp, "webinar_enrollment");
    if (!otpRecord) {
      return res
        .status(400)
        .json({ error: "Invalid or expired OTP. Please try again." });
    }

    const payload =
      typeof otpRecord.payload === "string"
        ? JSON.parse(otpRecord.payload)
        : otpRecord.payload;

    // Verify payment ID matches
    if (payload.paymentId !== paymentId) {
      return res
        .status(400)
        .json({ error: "Payment ID mismatch. Please try again." });
    }

    // Update user - record webinar registration
    // For now, we'll just send a success response and log the registration
    console.log(
      `User ${req.user.id} (${email}) registered for webinar with payment ${paymentId}`,
    );

    res.json({
      message:
        "Webinar registration successful! You will receive session details via email.",
      registrationType: "webinar",
      paymentId: paymentId,
    });
  } catch (err) {
    console.error("Webinar enrollment verification error:", err);
    res.status(500).json({ error: "Server error. Please try again." });
  }
});

module.exports = router;
