const express = require('express');
const router = express.Router();
const { query } = require('../db');

// 1. GET ATTENDANCE
// Query: ?date=YYYY-MM-DD
router.get('/', async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ message: "Date is required" });
        }

        // Fetch student attendance
        const studentRes = await query(
            'SELECT * FROM student_attendance WHERE date = $1',
            [date]
        );

        // Fetch teacher attendance
        const teacherRes = await query(
            'SELECT * FROM teacher_attendance WHERE date = $1',
            [date]
        );

        // Combine results
        const combined = [...studentRes.rows, ...teacherRes.rows];
        res.json(combined);

    } catch (err) {
        console.error("Error fetching attendance:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

// 2. GET STATS (Overall Average)
router.get('/stats', async (req, res) => {
    try {
        // Calculate counts for Student Present and Absent
        // TODO: Add separate stats for teachers if needed, currently this reflects students
        const result = await query(
            `SELECT 
                SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present_count,
                SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absent_count
             FROM student_attendance`
        );

        const present = parseInt(result.rows[0].present_count || 0);
        const absent = parseInt(result.rows[0].absent_count || 0);
        const total = present + absent;

        let averageRate = 0;
        if (total > 0) {
            averageRate = Math.round((present / total) * 100);
        }

        res.json({ averageRate, totalRecords: total });

    } catch (err) {
        console.error("Error fetching stats:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

// 3. SAVE ATTENDANCE (Upsert)
router.post('/', async (req, res) => {
    try {
        const { studentId, teacherId, date, status, remarks } = req.body;
        const reason = remarks || '';

        if (!date || !status) {
            return res.status(400).json({ message: "Date and Status are required" });
        }

        if (!studentId && !teacherId) {
            return res.status(400).json({ message: "Student ID or Teacher ID is required" });
        }

        let queryText = '';
        let values = [];

        if (studentId) {
            // Student: Upsert into student_attendance
            queryText = `
                INSERT INTO student_attendance (student_id, date, status, reason)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (student_id, date) 
                DO UPDATE SET status = EXCLUDED.status, reason = EXCLUDED.reason, created_at = CURRENT_TIMESTAMP
                RETURNING *;
            `;
            values = [studentId, date, status, reason];
        } else {
            // Teacher: Upsert into teacher_attendance
            // Note: teacher_attendance schema does not explicitly show 'reason', so currently omitting it or using check_in/out if appropriate.
            // Assuming simplified schema: id, teacher_id, date, status, check_in, check_out, created_at
            queryText = `
                INSERT INTO teacher_attendance (teacher_id, date, status)
                VALUES ($1, $2, $3)
                ON CONFLICT (teacher_id, date) 
                DO UPDATE SET status = EXCLUDED.status, created_at = CURRENT_TIMESTAMP
                RETURNING *;
            `;
            values = [teacherId, date, status];
        }

        const result = await query(queryText, values);
        res.json(result.rows[0]);

    } catch (err) {
        console.error("Error saving attendance:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

module.exports = router;
