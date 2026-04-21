require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const mysql = require("mysql2/promise"); // ✅ ADD THIS

const app = express();
app.use(cors());
app.use(express.json());

// ✅ DB CONNECTION TEST (ADD THIS BLOCK)
async function connectDB() {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT
    });

    console.log("✅ MySQL Connected Successfully");
  } catch (err) {
    console.error("❌ MySQL Connection Failed:", err.message);
  }
}

connectDB();
// ------------------------------------

// Serve frontend static files
app.use(express.static(path.join(__dirname, "..")));

// API routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/courses", require("./routes/courses"));
app.use("/api/progress", require("./routes/progress"));

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`HR KURAL server running on http://localhost:${PORT}`)
);
