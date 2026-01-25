const express = require('express');
const router = express.Router();
const db = require('../db');

// Get all exams
router.get('/', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                e.id, 
                e.title, 
                e.exam_date, 
                e.start_time, 
                e.end_time, 
                e.venue, 
                e.total_marks, 
                e.status,
                e.program_id,
                e.subject_id,
                p.name AS program_name,
                s.code AS subject_code,
                s.name AS subject_name,
                (SELECT COUNT(*) FROM subjects WHERE program_id = p.id) as subjects_count
            FROM exams e
            LEFT JOIN programs p ON e.program_id = p.id
            LEFT JOIN subjects s ON e.subject_id = s.id
            ORDER BY e.exam_date DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get single exam by ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query(`
            SELECT 
                e.*,
                p.name AS program_name,
                s.name AS subject_name,
                s.code AS subject_code
            FROM exams e
            LEFT JOIN programs p ON e.program_id = p.id
            LEFT JOIN subjects s ON e.subject_id = s.id
            WHERE e.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Exam not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create new exam
router.post('/', async (req, res) => {
    const { title, program_id, subject_id, exam_date, start_time, end_time, venue, total_marks, status } = req.body;
    try {
        const result = await db.query(
            `INSERT INTO exams (title, program_id, subject_id, exam_date, start_time, end_time, venue, total_marks, status) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [title, program_id, subject_id, exam_date, start_time, end_time, venue, total_marks, status]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update exam
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { title, program_id, subject_id, exam_date, start_time, end_time, venue, total_marks, status } = req.body;
    try {
        const result = await db.query(
            `UPDATE exams 
             SET title = $1, program_id = $2, subject_id = $3, exam_date = $4, start_time = $5, end_time = $6, venue = $7, total_marks = $8, status = $9
             WHERE id = $10 RETURNING *`,
            [title, program_id, subject_id, exam_date, start_time, end_time, venue, total_marks, status, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Exam not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete exam
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query('DELETE FROM exams WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Exam not found' });
        }
        res.json({ message: 'Exam deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get results for an exam
router.get('/:id/results', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query(`
            SELECT 
                er.*,
                s.name as student_name,
                s.reg_no,
                s.current_year
            FROM exam_results er
            JOIN students s ON er.student_id = s.id
            WHERE er.exam_id = $1
        `, [id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Save/Update results
router.post('/results', async (req, res) => {
    const { exam_id, results } = req.body; // results is array of { student_id, marks_obtained, grade, remarks, status }

    const client = await db.pool.connect(); // Assuming db.pool is available via db.js standard export, otherwise use db directly if it's a pool

    try {
        await client.query('BEGIN');

        for (const result of results) {
            // Check if exists
            const existing = await client.query(
                'SELECT id FROM exam_results WHERE exam_id = $1 AND student_id = $2',
                [exam_id, result.student_id]
            );

            if (existing.rows.length > 0) {
                // Update
                await client.query(
                    `UPDATE exam_results 
                     SET marks_obtained = $1, grade = $2, remarks = $3, status = $4
                     WHERE exam_id = $5 AND student_id = $6`,
                    [result.marks_obtained, result.grade, result.remarks, result.status, exam_id, result.student_id]
                );
            } else {
                // Insert
                await client.query(
                    `INSERT INTO exam_results (exam_id, student_id, marks_obtained, grade, remarks, status)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [exam_id, result.student_id, result.marks_obtained, result.grade, result.remarks, result.status]
                );
            }
        }

        await client.query('COMMIT');
        res.json({ message: 'Results saved successfully' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

module.exports = router;
