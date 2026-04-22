const express = require('express');
const router = express.Router();
const db = require('../db');

// Helper: returns the date (YYYY-MM-DD) of the next occurrence of 'dayName'
// on or after today. E.g. if today is Monday and dayName = 'Friday',
// returns the coming Friday's date.
const nextOccurrenceOf = (dayName) => {
    const dayMap = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
    const target = dayMap[dayName];
    if (target === undefined) return new Date().toISOString().split('T')[0]; // fallback
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayDay = today.getDay(); // 0 = Sunday
    let daysUntil = (target - todayDay + 7) % 7; // 0 means today
    today.setDate(today.getDate() + daysUntil);
    return today.toISOString().split('T')[0];
};

// 1. GET ALL SCHEDULES (With Details)
router.get('/', async (req, res) => {
    try {
        const { programId, year } = req.query;

        // Only fetch ACTIVE (current) schedule versions — effective_to IS NULL means not yet closed
        let query = `
            SELECT s.id, s.day_of_week, s.start_time, s.end_time, s.type,
                   s.effective_from, s.effective_to,
                   sub.name as subject_name,
                   t.name as teacher_name,
                   p.name as program_name,
                   s.program_id, s.subject_id, s.teacher_id
            FROM schedules s
            LEFT JOIN subjects sub ON s.subject_id = sub.id
            LEFT JOIN teachers t ON s.teacher_id = t.id
            LEFT JOIN programs p ON s.program_id = p.id
            WHERE s.effective_to IS NULL
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
            teacherId: row.teacher_id,
            // Expose effective dates so the frontend can hide future slots
            effectiveFrom: row.effective_from ? row.effective_from.toISOString().split('T')[0] : null,
            effectiveTo: row.effective_to ? row.effective_to.toISOString().split('T')[0] : null
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

    // 2. Check Teacher Conflict (only against active schedules)
    if (teacherId) {
        let teacherQuery = `
            SELECT id, start_time, end_time FROM schedules 
            WHERE day_of_week = $1 
            AND teacher_id = $2
            AND effective_to IS NULL
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

    // 3. Check Student Batch Conflict (Program + Grade) — only against active schedules
    if (subjectId) {
        let batchQuery = `
            SELECT s.id, s.start_time, s.end_time, sub.year, sub.name as subject_name
            FROM schedules s
            LEFT JOIN subjects sub ON s.subject_id = sub.id
            WHERE s.program_id = $1 
            AND s.day_of_week = $2
            AND s.effective_to IS NULL
            AND (
                (s.start_time < $4 AND s.end_time > $3)
            )
        `;

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

        // Set effective_from to today so the slot appears immediately in the current week
        const query = `
            INSERT INTO schedules 
            (program_id, subject_id, teacher_id, day_of_week, start_time, end_time, type, effective_from, effective_to)
            VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, NULL)
            RETURNING *
        `;

        const values = [programId, subjectId || null, teacherId || null, day, startTime, endTime, type || ''];

        const result = await db.query(query, values);
        res.status(201).json({ ...result.rows[0], effectiveFrom: result.rows[0].effective_from });

    } catch (err) {
        console.error("Error creating schedule:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 3. UPDATE SCHEDULE (Versioning: close old row, insert new)
// This preserves historical attendance accuracy. Past attendance records reference the OLD schedule_id,
// which is kept intact (just closed). The frontend receives the NEW schedule_id going forward.
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { programId, subjectId, teacherId, day, startTime, endTime, type } = req.body;

        // Validation
        if (startTime >= endTime) {
            return res.status(400).json({ message: "Start time must be before end time" });
        }

        // Fetch the existing active schedule to make sure it exists
        const existing = await db.query(
            'SELECT * FROM schedules WHERE id = $1 AND effective_to IS NULL',
            [id]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ message: "Active schedule not found" });
        }

        // Conflict check against all active schedules EXCEPT the one being replaced
        const conflict = await checkConflicts(programId, subjectId, teacherId, day, startTime, endTime, id);
        if (conflict) {
            return res.status(409).json({ message: conflict });
        }

        // --- VERSIONING LOGIC ---
        // Step 1: Close the old record by setting effective_to = yesterday
        // (Yesterday because today's sessions may already have used the old schedule_id)
        await db.query(
            `UPDATE schedules 
             SET effective_to = CURRENT_DATE - INTERVAL '1 day' 
             WHERE id = $1`,
            [id]
        );

        // Step 2: Insert a new schedule record starting from today
        const insertResult = await db.query(
            `INSERT INTO schedules 
             (program_id, subject_id, teacher_id, day_of_week, start_time, end_time, type, effective_from, effective_to)
             VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, NULL)
             RETURNING *`,
            [programId, subjectId || null, teacherId || null, day, startTime, endTime, type || '']
        );

        const newSchedule = insertResult.rows[0];

        res.json({
            oldId: parseInt(id),
            newId: newSchedule.id,
            schedule: newSchedule,
            message: 'Schedule updated with versioning. Historical attendance is preserved.'
        });

    } catch (err) {
        console.error("Error updating schedule (versioning):", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 4a. CLEAR ALL SLOTS FOR A PROGRAM (soft-close via versioning)
// Sets effective_to = today for every active slot of a program so historical
// attendance data (which references schedule IDs) is never orphaned.
router.delete('/by-program/:programId', async (req, res) => {
    try {
        const { programId } = req.params;
        const result = await db.query(
            `UPDATE schedules
             SET effective_to = CURRENT_DATE
             WHERE program_id = $1 AND effective_to IS NULL
             RETURNING id`,
            [programId]
        );
        res.json({
            message: `Cleared ${result.rows.length} slot(s) for program ${programId}.`,
            clearedIds: result.rows.map(r => r.id)
        });
    } catch (err) {
        console.error('Error clearing program slots:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 4b. DELETE SCHEDULE (single slot)
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