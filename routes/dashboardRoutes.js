const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
    try {
        // 1. மொத்த மாணவர்கள் (Total Students)
        const studentCount = await db.query("SELECT COUNT(*) FROM students WHERE status = 'Active'");

        // 2. மொத்த ஆசிரியர்கள் (Total Teachers)
        const teacherCount = await db.query("SELECT COUNT(*) FROM teachers WHERE status = 'Active'");

        // 3. மொத்த பாடங்கள் (Total Subjects)
        const subjectCount = await db.query("SELECT COUNT(*) FROM subjects");

        // 4. சமீபத்திய நிகழ்வுகள் (Recent Activities - Example: Last 5 added students)
        const recentActivities = await db.query("SELECT name, created_at FROM students ORDER BY created_at DESC LIMIT 5");

        res.json({
            totalStudents: parseInt(studentCount.rows[0].count),
            totalTeachers: parseInt(teacherCount.rows[0].count),
            totalSubjects: parseInt(subjectCount.rows[0].count),
            recentActivities: recentActivities.rows
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server Error" });
    }
});

module.exports = router;
