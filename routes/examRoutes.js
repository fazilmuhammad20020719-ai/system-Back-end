const express = require('express');
const router = express.Router();
const { pool, query } = require('../db');

// GET all exams
router.get('/', async (req, res) => {
    try {
        const result = await query(`
            SELECT 
                e.*,
                p.name as program_name,
                s.name as subject_name
            FROM exams e
            LEFT JOIN programs p ON e.program_id = p.id
            LEFT JOIN subjects s ON e.subject_id = s.id
            ORDER BY e.exam_date DESC, e.start_time ASC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// POST create a new exam
router.post('/', async (req, res) => {
    try {
        const { title, programId, subjectId, startDate, startTime, endTime, venue, totalMarks, description } = req.body;

        const newExam = await query(
            `INSERT INTO exams (title, program_id, subject_id, exam_date, start_time, end_time, venue, total_marks, status) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Upcoming') 
             RETURNING *`,
            [title, programId, subjectId, startDate, startTime, endTime, venue, totalMarks || 100]
        );

        res.json(newExam.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// DELETE an exam
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM exams WHERE id = $1', [id]);
        res.json({ message: 'Exam deleted' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// POST mark attendance
router.post('/attendance', async (req, res) => {
    try {
        const { examId, studentId, status } = req.body;
        // Upsert into exam_results
        await query(
            `INSERT INTO exam_results (exam_id, student_id, status)
             VALUES ($1, $2, $3)
             ON CONFLICT (exam_id, student_id)
             DO UPDATE SET status = EXCLUDED.status, created_at = CURRENT_TIMESTAMP`,
            [examId, studentId, status]
        );
        res.json({ message: 'Attendance updated' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// GET exam attendance
router.get('/:id/attendance', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query(
            `SELECT student_id, status FROM exam_results WHERE exam_id = $1`,
            [id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// GET exam results (joined with students)
router.get('/:id/results', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query(`
            SELECT 
                s.id as student_id,
                s.name as student_name,
                er.marks_obtained,
                er.grade,
                er.status,
                er.remarks
            FROM students s
            LEFT JOIN exam_results er ON s.id = er.student_id AND er.exam_id = $1
            JOIN exams e ON e.id = $1
            WHERE s.program_id = e.program_id
            ORDER BY s.id ASC
        `, [id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// POST batch update results
router.post('/results', async (req, res) => {
    try {
        const { examId, results } = req.body;
        // results is an array of { studentId, marks, grade, status, remarks }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const r of results) {
                await client.query(
                    `INSERT INTO exam_results (exam_id, student_id, marks_obtained, grade, status, remarks)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (exam_id, student_id)
                     DO UPDATE SET 
                        marks_obtained = EXCLUDED.marks_obtained,
                        grade = EXCLUDED.grade,
                        status = EXCLUDED.status,
                        remarks = EXCLUDED.remarks,
                        created_at = CURRENT_TIMESTAMP`,
                    [examId, r.studentId, r.marks, r.grade, r.status, r.remarks]
                );
            }
            await client.query('COMMIT');
            res.json({ message: 'Results updated successfully' });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
