const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || "", // ✅ FIX 1
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,               // ✅ FIX 2
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;