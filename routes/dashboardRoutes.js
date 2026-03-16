const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
    try {
        // 0. Get Today's Date (Local time - Sri Lanka to avoid timezone bugs after midnight)
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });

        // 1. Total Students (Active Enrolled)
        // We use this as the denominator
        const studentStats = await db.query(
            "SELECT COUNT(*) as total FROM students WHERE status = 'Active'"
        );
        const totalStudents = parseInt(studentStats.rows[0].total) || 0;

        // 2. Active Students -> Present Students Today
        // We count how many marked 'Present' for today AND are currently Active
        const presentStudentsReq = await db.query(
            `SELECT COUNT(sa.*) as present 
             FROM student_attendance sa 
             JOIN students s ON sa.student_id = s.id 
             WHERE sa.date = $1 AND sa.status = 'Present' AND s.status = 'Active'`,
            [todayStr]
        );
        const activeStudents = parseInt(presentStudentsReq.rows[0].present) || 0;

        // 3. Total Teachers (Active Enrolled)
        const teacherStats = await db.query(
            "SELECT COUNT(*) as total FROM teachers WHERE status = 'Active'"
        );
        const totalTeachers = parseInt(teacherStats.rows[0].total) || 0;

        // 4. Active Teachers -> Present Teachers Today
        const presentTeachersReq = await db.query(
            `SELECT COUNT(ta.*) as present 
             FROM teacher_attendance ta 
             JOIN teachers t ON ta.teacher_id = t.id 
             WHERE ta.date = $1 AND ta.status = 'Present' AND t.status = 'Active'`,
            [todayStr]
        );
        const activeTeachers = parseInt(presentTeachersReq.rows[0].present) || 0;

        // 3. Documents
        const documentCount = await db.query("SELECT COUNT(*) FROM documents");
        const totalDocuments = parseInt(documentCount.rows[0].count) || 0;

        // Calculate Percentages
        const studentAttendance = totalStudents > 0 ? Math.round((activeStudents / totalStudents) * 100) + '%' : '0%';
        const teacherAttendance = totalTeachers > 0 ? Math.round((activeTeachers / totalTeachers) * 100) + '%' : '0%';

        // 4. Recent Activities - from the activities table, last 24 hours, max 10
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const recentActivitiesRes = await db.query(
            `SELECT id, title, description, icon_type, created_at
             FROM activities
             WHERE created_at >= $1
             ORDER BY created_at DESC
             LIMIT 10`,
            [since24h]
        );

        let activities = recentActivitiesRes.rows;

        // Response structure matching Frontend
        res.json({
            stats: {
                students: totalStudents,
                teachers: totalTeachers,
                documents: totalDocuments,
                programs: 0, // Placeholder if needed or add query
                studentAttendance: studentAttendance,
                teacherAttendance: teacherAttendance,
                activeStudents: activeStudents,
                activeTeachers: activeTeachers
            },
            activities: activities,
            alerts: [] // Future: Link to alerts table
        });

    } catch (err) {
        console.error("Dashboard Error:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

module.exports = router;
