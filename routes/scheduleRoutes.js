const express = require('express');
const router = express.Router();
const db = require('../db');

// 1. GET ALL SCHEDULES (With Details)
router.get('/', async (req, res) => {
    try {
        const { programId, year } = req.query;

        // "classroom" நீக்கப்பட்டது, "type" சேர்க்கப்பட்டுள்ளது
        let query = `
            SELECT s.id, s.day_of_week, s.start_time, s.end_time, s.type,
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
            query += ` AND sub.year = $${paramCount}`;
            params.push(year);
            paramCount++;
        }

        query += ` ORDER BY s.day_of_week, s.start_time ASC`;

        const result = await db.query(query, params);

        const formattedData = result.rows.map(row => ({
            id: row.id,
            day: row.day_of_week,
            startTime: row.start_time,
            endTime: row.end_time,
            subject: row.subject_name,
            teacher: row.teacher_name,
            type: row.type, // "About Class" info
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

// Helper to check for conflicts
const checkConflicts = async (programId, subjectId, teacherId, day, startTime, endTime, excludeId = null) => {
    // 1. Get Grade/Year for the Subject
    let year = 'General';
    if (subjectId) {
        const subRes = await db.query('SELECT year FROM subjects WHERE id = $1', [subjectId]);
        if (subRes.rows.length > 0) {
            year = subRes.rows[0].year;
        }
    }

    // Normalization Helper: "Grade 1" -> "1", "1" -> "1"
    const normalizeYear = (y) => {
        if (!y) return 'general';
        const str = String(y).toLowerCase().replace(/grade\s*/, '').trim();
        return str === '' ? 'general' : str;
    };

    const targetYearNorm = normalizeYear(year);

    // 2. Check Teacher Conflict
    if (teacherId) {
        let teacherQuery = `
            SELECT id, start_time, end_time FROM schedules 
            WHERE day_of_week = $1 
            AND teacher_id = $2
            AND (
                (start_time < $4 AND end_time > $3) -- Overlap logic
            )
        `;
        const teacherParams = [day, teacherId, startTime, endTime];

        if (excludeId) {
            teacherQuery += ` AND id != $5`;
            teacherParams.push(excludeId);
        }

        const teacherConflict = await db.query(teacherQuery, teacherParams);
        if (teacherConflict.rows.length > 0) {
            const conflict = teacherConflict.rows[0];
            return `Teacher is already booked (${conflict.start_time} - ${conflict.end_time}).`;
        }
    }

    // 3. Check Student Batch Conflict (Program + Grade)
    if (subjectId) {
        let batchQuery = `
            SELECT s.id, s.start_time, s.end_time, sub.year, sub.name as subject_name
            FROM schedules s
            LEFT JOIN subjects sub ON s.subject_id = sub.id
            WHERE s.program_id = $1 
            AND s.day_of_week = $2
            AND (
                (s.start_time < $4 AND s.end_time > $3)
            )
        `;
        // Note: We check ALL schedules for this program/day/time first, filter by year in JS for complexity handling

        const batchParams = [programId, day, startTime, endTime];
        if (excludeId) {
            batchQuery += ` AND s.id != $5`;
            batchParams.push(excludeId);
        }

        const batchConflicts = await db.query(batchQuery, batchParams);

        for (const row of batchConflicts.rows) {
            const rowYearNorm = normalizeYear(row.year);
            const rowIsGeneral = rowYearNorm === 'general';
            const targetIsGeneral = targetYearNorm === 'general';

            // Conflict if:
            // 1. Either is 'General' (applies to all grades)
            // 2. Exact match (e.g. "1" == "1")

            if (rowIsGeneral || targetIsGeneral || rowYearNorm === targetYearNorm) {
                return `Student batch (${row.year || 'General'}) is busy with ${row.subject_name} (${row.start_time} - ${row.end_time}).`;
            }
        }
    }

    return null;
};

// 2. CREATE CLASS SCHEDULE
router.post('/', async (req, res) => {
    try {
        const { programId, subjectId, teacherId, day, startTime, endTime, type } = req.body;

        // Validation for Break
        const isBreak = type === 'Break';

        if (!programId || !day || !startTime || !endTime) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        if (!isBreak && !subjectId) {
            return res.status(400).json({ message: "Subject is required for classes" });
        }

        if (startTime >= endTime) {
            return res.status(400).json({ message: "Start time must be before end time" });
        }

        // Conflict Check
        const conflict = await checkConflicts(programId, subjectId, teacherId, day, startTime, endTime);
        if (conflict) {
            return res.status(409).json({ message: conflict });
        }

        const query = `
            INSERT INTO schedules 
            (program_id, subject_id, teacher_id, day_of_week, start_time, end_time, type)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;

        const values = [programId, subjectId || null, teacherId || null, day, startTime, endTime, type || ''];

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
        const { programId, subjectId, teacherId, day, startTime, endTime, type } = req.body;

        const isBreak = type === 'Break';

        // Validation
        if (startTime >= endTime) {
            return res.status(400).json({ message: "Start time must be before end time" });
        }

        const conflict = await checkConflicts(programId, subjectId, teacherId, day, startTime, endTime, id);
        if (conflict) {
            return res.status(409).json({ message: conflict });
        }

        const query = `
            UPDATE schedules 
            SET program_id=$1, subject_id=$2, teacher_id=$3, day_of_week=$4, 
                start_time=$5, end_time=$6, type=$7
            WHERE id=$8
            RETURNING *
        `;

        const values = [programId, subjectId || null, teacherId || null, day, startTime, endTime, type || '', id];

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