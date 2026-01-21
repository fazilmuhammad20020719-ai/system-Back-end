const express = require('express');
const router = express.Router();
const db = require('../db');

// 1. GET ALL SCHEDULES (With Details)
router.get('/', async (req, res) => {
    try {
        const { programId, year } = req.query;

        let query = `
            SELECT s.id, s.day_of_week, s.start_time, s.end_time, s.classroom, s.type,
                   sub.name as subject_name,
                   t.name as teacher_name,
                   p.name as program_name,
                   s.program_id, s.subject_id, s.teacher_id
            FROM schedules s
            LEFT JOIN subjects sub ON s.subject_id = sub.id
            LEFT JOIN teachers t ON s.teacher_id = t.id
            LEFT JOIN programs p ON s.program_id = p.id
            WHERE 1=1
        `;

        const params = [];
        let paramCount = 1;

        if (programId && programId !== 'All') {
            query += ` AND s.program_id = $${paramCount}`;
            params.push(programId);
            paramCount++;
        }

        if (year && year !== 'All') {
            // Assuming subjects table has a 'year' column or we filter by subject year
            query += ` AND sub.year = $${paramCount}`;
            params.push(year);
            paramCount++;
        }

        query += ` ORDER BY s.day_of_week, s.start_time ASC`;

        const result = await db.query(query, params);

        // Format data for frontend
        const formattedData = result.rows.map(row => ({
            id: row.id,
            day: row.day_of_week,
            startTime: row.start_time, // HH:MM:SS
            endTime: row.end_time,
            subject: row.subject_name,
            teacher: row.teacher_name,
            room: row.classroom,
            type: row.type,
            programId: row.program_id,
            subjectId: row.subject_id,
            teacherId: row.teacher_id
        }));

        res.json(formattedData);

    } catch (err) {
        console.error("Error fetching schedules:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 2. CREATE CLASS SCHEDULE
router.post('/', async (req, res) => {
    try {
        const { programId, subjectId, teacherId, day, startTime, endTime, classroom, type } = req.body;

        // Validation
        if (!programId || !subjectId || !day || !startTime || !endTime) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const query = `
            INSERT INTO schedules 
            (program_id, subject_id, teacher_id, day_of_week, start_time, end_time, classroom, type)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;

        const values = [programId, subjectId, teacherId || null, day, startTime, endTime, classroom, type || 'Lecture'];

        const result = await db.query(query, values);
        res.status(201).json(result.rows[0]);

    } catch (err) {
        console.error("Error creating schedule:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 3. UPDATE SCHEDULE
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { programId, subjectId, teacherId, day, startTime, endTime, classroom, type } = req.body;

        const query = `
            UPDATE schedules 
            SET program_id=$1, subject_id=$2, teacher_id=$3, day_of_week=$4, 
                start_time=$5, end_time=$6, classroom=$7, type=$8
            WHERE id=$9
            RETURNING *
        `;

        const values = [programId, subjectId, teacherId || null, day, startTime, endTime, classroom, type, id];

        const result = await db.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Schedule not found" });
        }

        res.json(result.rows[0]);

    } catch (err) {
        console.error("Error updating schedule:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 4. DELETE SCHEDULE
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM schedules WHERE id = $1', [id]);
        res.json({ message: "Schedule deleted successfully" });
    } catch (err) {
        console.error("Error deleting schedule:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;