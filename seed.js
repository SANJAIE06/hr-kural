const mysql = require("mysql2/promise");
require("dotenv").config();

async function seed() {
  // Connect without database first to create it
  let conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  console.log("Creating database...");
  await conn.query(
    "CREATE DATABASE IF NOT EXISTS `" + process.env.DB_NAME + "`",
  );
  await conn.end();

  // Reconnect with the database selected
  conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
  });

  console.log("Creating tables...");

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      first_name    VARCHAR(100) NOT NULL,
      last_name     VARCHAR(100) NOT NULL,
      email         VARCHAR(255) NOT NULL UNIQUE,
      phone         VARCHAR(20),
      password_hash VARCHAR(255) NOT NULL,
      role          ENUM('hr','expert','seeker','learner') NOT NULL DEFAULT 'seeker',
      enrolled_courses JSON DEFAULT NULL,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS courses (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      title       VARCHAR(255) NOT NULL,
      description TEXT,
      domain      VARCHAR(100) NOT NULL,
      thumbnail   VARCHAR(500),
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS course_topics (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      course_id     INT NOT NULL,
      title         VARCHAR(255) NOT NULL,
      sort_order    INT NOT NULL DEFAULT 0,
      youtube_url   VARCHAR(500) NOT NULL,
      duration_mins INT DEFAULT 0,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    )
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS user_progress (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      user_id     INT NOT NULL,
      topic_id    INT NOT NULL,
      completed   BOOLEAN DEFAULT FALSE,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_user_topic (user_id, topic_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (topic_id) REFERENCES course_topics(id) ON DELETE CASCADE
    )
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS otp_codes (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      email       VARCHAR(255) NOT NULL,
      code        VARCHAR(6) NOT NULL,
      purpose     ENUM('enrollment') NOT NULL,
      payload     JSON DEFAULT NULL,
      expires_at  TIMESTAMP NOT NULL,
      used        BOOLEAN DEFAULT FALSE,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Check if courses already seeded
  const [existing] = await conn.execute("SELECT COUNT(*) as cnt FROM courses");
  if (existing[0].cnt > 0) {
    console.log("Courses already seeded. Skipping...");
    await conn.end();
    return;
  }

  console.log("Seeding courses...");

  // HR Management courses
  const [c1] = await conn.execute(
    "INSERT INTO courses (title, description, domain) VALUES (?, ?, ?)",
    [
      "HR Fundamentals",
      "Learn the core concepts of Human Resource Management including planning, staffing, and employee relations.",
      "HR Management",
    ],
  );
  const [c2] = await conn.execute(
    "INSERT INTO courses (title, description, domain) VALUES (?, ?, ?)",
    [
      "Performance Management",
      "Master performance appraisal systems, goal setting, feedback techniques, and continuous improvement.",
      "HR Management",
    ],
  );

  // Recruitment courses
  const [c3] = await conn.execute(
    "INSERT INTO courses (title, description, domain) VALUES (?, ?, ?)",
    [
      "Talent Acquisition Mastery",
      "End-to-end recruitment process from job analysis to onboarding, with modern sourcing strategies.",
      "Recruitment",
    ],
  );
  const [c4] = await conn.execute(
    "INSERT INTO courses (title, description, domain) VALUES (?, ?, ?)",
    [
      "Interview Skills for Recruiters",
      "Structured interviewing techniques, behavioral questioning, and candidate assessment methods.",
      "Recruitment",
    ],
  );

  // Labour Law courses
  const [c5] = await conn.execute(
    "INSERT INTO courses (title, description, domain) VALUES (?, ?, ?)",
    [
      "Indian Labour Law Essentials",
      "Key labour legislation in India including Factories Act, EPF, ESI, and the new Labour Codes.",
      "Labour Law",
    ],
  );

  // Soft Skills courses
  const [c6] = await conn.execute(
    "INSERT INTO courses (title, description, domain) VALUES (?, ?, ?)",
    [
      "Business Communication",
      "Professional communication skills for emails, presentations, meetings, and stakeholder management.",
      "Soft Skills",
    ],
  );
  const [c7] = await conn.execute(
    "INSERT INTO courses (title, description, domain) VALUES (?, ?, ?)",
    [
      "Leadership & Team Management",
      "Develop leadership qualities, team building strategies, conflict resolution, and motivation techniques.",
      "Soft Skills",
    ],
  );

  // Career Development courses
  const [c8] = await conn.execute(
    "INSERT INTO courses (title, description, domain) VALUES (?, ?, ?)",
    [
      "Resume Building & Job Search",
      "Create ATS-friendly resumes, write compelling cover letters, and master modern job search strategies.",
      "Career Development",
    ],
  );

  console.log("Seeding topics...");

  // Topics for HR Fundamentals (course 1)
  const topicsC1 = [
    ["Introduction to HRM", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", 15],
    [
      "HR Planning & Strategy",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      20,
    ],
    [
      "Recruitment & Selection Basics",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      18,
    ],
    ["Employee Onboarding", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", 12],
    [
      "Compensation & Benefits",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      22,
    ],
  ];

  // Topics for Performance Management (course 2)
  const topicsC2 = [
    [
      "Goal Setting Frameworks",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      14,
    ],
    ["KPIs and OKRs", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", 18],
    [
      "Giving Effective Feedback",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      16,
    ],
    [
      "Performance Review Process",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      20,
    ],
  ];

  // Topics for Talent Acquisition (course 3)
  const topicsC3 = [
    [
      "Job Analysis & Description",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      15,
    ],
    ["Sourcing Strategies", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", 20],
    [
      "Screening & Shortlisting",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      14,
    ],
    ["Offer Management", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", 12],
    [
      "Onboarding Best Practices",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      16,
    ],
  ];

  // Topics for Interview Skills (course 4)
  const topicsC4 = [
    [
      "Structured vs Unstructured Interviews",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      12,
    ],
    [
      "Behavioral Interview Techniques",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      18,
    ],
    [
      "STAR Method Deep Dive",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      15,
    ],
    [
      "Assessing Cultural Fit",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      14,
    ],
  ];

  // Topics for Labour Law (course 5)
  const topicsC5 = [
    [
      "Factories Act Overview",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      25,
    ],
    ["EPF & ESI Explained", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", 20],
    [
      "Payment of Wages & Bonus",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      18,
    ],
    [
      "New Labour Codes 2020",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      22,
    ],
    [
      "Industrial Disputes Act",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      20,
    ],
  ];

  // Topics for Business Communication (course 6)
  const topicsC6 = [
    [
      "Professional Email Writing",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      14,
    ],
    ["Presentation Skills", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", 20],
    ["Meeting Facilitation", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", 16],
    [
      "Stakeholder Communication",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      15,
    ],
  ];

  // Topics for Leadership (course 7)
  const topicsC7 = [
    ["Leadership Styles", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", 18],
    [
      "Building High-Performing Teams",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      22,
    ],
    ["Conflict Resolution", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", 16],
    [
      "Motivation & Engagement",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      14,
    ],
  ];

  // Topics for Resume Building (course 8)
  const topicsC8 = [
    [
      "ATS-Friendly Resume Format",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      16,
    ],
    [
      "Writing Impact Statements",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      14,
    ],
    [
      "Cover Letter Essentials",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      12,
    ],
    [
      "LinkedIn Profile Optimisation",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      18,
    ],
    [
      "Job Search Strategies",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      20,
    ],
  ];

  const allTopics = [
    [c1.insertId, topicsC1],
    [c2.insertId, topicsC2],
    [c3.insertId, topicsC3],
    [c4.insertId, topicsC4],
    [c5.insertId, topicsC5],
    [c6.insertId, topicsC6],
    [c7.insertId, topicsC7],
    [c8.insertId, topicsC8],
  ];

  for (const [courseId, topics] of allTopics) {
    for (let i = 0; i < topics.length; i++) {
      const [title, url, duration] = topics[i];
      await conn.execute(
        "INSERT INTO course_topics (course_id, title, sort_order, youtube_url, duration_mins) VALUES (?, ?, ?, ?, ?)",
        [courseId, title, i + 1, url, duration],
      );
    }
  }

  console.log("Seed complete! 8 courses with topics inserted.");
  await conn.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
