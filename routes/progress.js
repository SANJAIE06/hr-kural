const express = require("express");
const pool = require("../db");
const auth = require("../middleware/auth");

const router = express.Router();

// POST /api/progress/toggle — mark topic complete/incomplete
router.post("/toggle", auth, async (req, res) => {
  try {
    const { topicId } = req.body;
    if (!topicId)
      return res.status(400).json({ error: "topicId is required." });

    // Check topic exists
    const [topics] = await pool.execute(
      "SELECT id FROM course_topics WHERE id = ?",
      [topicId],
    );
    if (topics.length === 0)
      return res.status(404).json({ error: "Topic not found." });

    // Upsert: insert or toggle
    const [existing] = await pool.execute(
      "SELECT id, completed FROM user_progress WHERE user_id = ? AND topic_id = ?",
      [req.user.id, topicId],
    );

    let completed;
    if (existing.length === 0) {
      await pool.execute(
        "INSERT INTO user_progress (user_id, topic_id, completed) VALUES (?, ?, TRUE)",
        [req.user.id, topicId],
      );
      completed = true;
    } else {
      completed = !existing[0].completed;
      await pool.execute(
        "UPDATE user_progress SET completed = ? WHERE id = ?",
        [completed, existing[0].id],
      );
    }

    res.json({ topicId, completed });
  } catch (err) {
    console.error("Toggle progress error:", err);
    res.status(500).json({ error: "Server error." });
  }
});

// GET /api/progress/:courseId — get progress for a course
router.get("/:courseId", auth, async (req, res) => {
  try {
    const [topics] = await pool.execute(
      "SELECT ct.id AS topicId, IFNULL(up.completed, FALSE) AS completed FROM course_topics ct LEFT JOIN user_progress up ON up.topic_id = ct.id AND up.user_id = ? WHERE ct.course_id = ? ORDER BY ct.sort_order",
      [req.user.id, req.params.courseId],
    );

    const completedCount = topics.filter((t) => !!t.completed).length;

    res.json({
      topics,
      completedCount,
      totalCount: topics.length,
      percentage:
        topics.length > 0
          ? Math.round((completedCount / topics.length) * 100)
          : 0,
    });
  } catch (err) {
    console.error("Get progress error:", err);
    res.status(500).json({ error: "Server error." });
  }
});

module.exports = router;
