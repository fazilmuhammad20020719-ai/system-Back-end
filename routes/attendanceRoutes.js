const express = require('express');
const router = express.Router();
const { query } = require('../db');

// 1. GET ATTENDANCE (Range & Status)
// Query: ?date=YYYY-MM-DD OR ?startDate=...&endDate=...
router.get('/', async (req, res) => {
    try {
        const { date, startDate, endDate } = req.query;

        if (startDate && endDate) {
            // 1. Get Explicit Sessions (Completed/Cancelled from new table)
            const sessionRes = await query(
                'SELECT schedule_id, date, status FROM class_sessions WHERE date >= $1 AND date <= $2',
                [startDate, endDate]
            );

            // 2. Get Implicit Sessions (Legacy: If students present in schedule_attendance, it's Completed)
            // We select DISTINCT schedule_id, date because multiple students have rows
            const legacyRes = await query(
                `SELECT DISTINCT schedule_id, date, 'Completed' as status 
                 FROM schedule_attendance 
                 WHERE date >= $1 AND date <= $2`,
                [startDate, endDate]
            );

            // 3. Merge: Explicit takes precedence (e.g. if marked Cancelled, it stays Cancelled)
            const sessionMap = {};

            // Populate from Legacy first (default to Completed)
            legacyRes.rows.forEach(row => {
                const key = `${row.schedule_id}-${row.date.toISOString().split('T')[0]}`;
                sessionMap[key] = row;
            });

            // Override with Explicit Sessions (Cancelled or explicitly Completed)
            sessionRes.rows.forEach(row => {
                const key = `${row.schedule_id}-${row.date.toISOString().split('T')[0]}`;
                sessionMap[key] = row;
            });

            return res.json(Object.values(sessionMap));
        }

        if (date) {
            // Existing Logic for single date attendance view
            const studentRes = await query(
                'SELECT * FROM student_attendance WHERE date = $1',
                [date]
            );
            const teacherRes = await query(
                'SELECT * FROM teacher_attendance WHERE date = $1',
                [date]
            );
            return res.json([...studentRes.rows, ...teacherRes.rows]);
        }

        return res.status(400).json({ message: "Date or Range required" });


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

// 4. GET SCHEDULE ATTENDANCE
router.get('/schedule', async (req, res) => {
    try {
        const { scheduleId, date } = req.query;
        if (!scheduleId || !date) {
            return res.status(400).json({ message: "Schedule ID and Date are required" });
        }

        const result = await query(
            'SELECT * FROM schedule_attendance WHERE schedule_id = $1 AND date = $2',
            [scheduleId, date]
        );

        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching schedule attendance:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

// 5. SAVE SCHEDULE ATTENDANCE (Bulk)
router.post('/schedule', async (req, res) => {
    try {
        const { scheduleId, date, attendanceData } = req.body;
        // attendanceData: [{ studentId, status }, ...]

        if (!scheduleId || !date || !Array.isArray(attendanceData)) {
            return res.status(400).json({ message: "Invalid payload" });
        }

        // We will execute multiple upserts. 
        // For better performance in large batches, we might construct a single query, 
        // but for a typical class size (30-50), loop is acceptable or a transaction.

        try {
            await query('BEGIN'); // Start Transaction

            for (const item of attendanceData) {
                const { studentId, status } = item;
                const queryText = `
                    INSERT INTO schedule_attendance (schedule_id, student_id, date, status)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (schedule_id, student_id, date)
                    DO UPDATE SET status = EXCLUDED.status, created_at = CURRENT_TIMESTAMP
                `;
                await query(queryText, [scheduleId, studentId, date, status]);
            }

            await query('COMMIT'); // Commit

            // ALSO Mark the session as 'Completed' in class_sessions
            try {
                const sessionQuery = `
                    INSERT INTO class_sessions (schedule_id, date, status)
                    VALUES ($1, $2, 'Completed')
                    ON CONFLICT (schedule_id, date)
                    DO UPDATE SET status = 'Completed', created_at = CURRENT_TIMESTAMP
               `;
                await query(sessionQuery, [scheduleId, date]);
            } catch (sessionErr) {
                console.error("Warning: Failed to update session status automatically", sessionErr);
                // Don't fail the whole request for this, but log it.
            }

            res.json({ message: "Attendance saved successfully" });

        } catch (err) {
            await query('ROLLBACK');
            throw err;
        }

    } catch (err) {
        console.error("Error saving schedule attendance:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

// 6. UPDATE SESSION STATUS (Cancel/Complete manual override)
router.post('/session-status', async (req, res) => {
    try {
        const { scheduleId, date, status } = req.body;

        if (!scheduleId || !date || !status) {
            return res.status(400).json({ message: "Missing fields" });
        }

        const queryText = `
            INSERT INTO class_sessions (schedule_id, date, status)
            VALUES ($1, $2, $3)
            ON CONFLICT (schedule_id, date)
            DO UPDATE SET status = EXCLUDED.status, created_at = CURRENT_TIMESTAMP
            RETURNING *;
        `;

        const result = await query(queryText, [scheduleId, date, status]);
        res.json(result.rows[0]);

    } catch (err) {
        console.error("Error updating session status:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

module.exports = router;