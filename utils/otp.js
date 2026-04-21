const nodemailer = require("nodemailer");
const pool = require("../db");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendOTP(email, purpose, payload) {
  const code = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await pool.execute(
    "INSERT INTO otp_codes (email, code, purpose, payload, expires_at) VALUES (?, ?, ?, ?, ?)",
    [email, code, purpose, JSON.stringify(payload), expiresAt],
  );

  await transporter.sendMail({
    from: `"HR KURAL" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: "Course Enrollment OTP - HR KURAL",
    html: `
      <div style="font-family: 'Outfit', sans-serif; max-width: 440px; margin: 0 auto; padding: 32px; border: 1px solid #e2e8f0; border-radius: 14px;">
        <h2 style="color: #0d2b56; margin-bottom: 8px;">HR KURAL</h2>
        <p style="color: #475569; font-size: 14px;">Use the code below to verify your course enrollment:</p>
        <div style="font-size: 36px; font-weight: bold; color: #1558b0; letter-spacing: 10px; padding: 20px; background: #e8f1fb; border-radius: 10px; text-align: center; margin: 20px 0;">
          ${code}
        </div>
        <p style="color: #94a3b8; font-size: 12px;">This code expires in 5 minutes. Do not share it with anyone.</p>
      </div>
    `,
  });

  return code;
}

async function verifyOTP(email, code, purpose) {
  const [rows] = await pool.execute(
    "SELECT * FROM otp_codes WHERE email = ? AND code = ? AND purpose = ? AND used = FALSE AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1",
    [email, code, purpose],
  );
  if (rows.length === 0) return null;

  await pool.execute("UPDATE otp_codes SET used = TRUE WHERE id = ?", [
    rows[0].id,
  ]);
  return rows[0];
}

module.exports = { sendOTP, verifyOTP };
