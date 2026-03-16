const express = require('express');
const router = express.Router();
const { query } = require('../db');

// 0. Get All Students (for dropdown)
// GET /api/hifz/all-students
router.get('/all-students', async (req, res) => {
    try {
        const result = await query(
            'SELECT id, name FROM students ORDER BY name ASC'
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching students for hifz dropdown:', error);
        res.status(500).json({ message: 'Internal server error.', error: error.message });
    }
});

// 1. Assign API
// POST /api/hifz/assign
router.post('/assign', async (req, res) => {
    try {
        const { studentId } = req.body;

        if (!studentId) {
            return res.status(400).json({ message: 'Student ID is required.' });
        }

        // Check if student exists in the students table
        const studentCheck = await query('SELECT id FROM students WHERE id = $1', [studentId]);
        if (studentCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Student not found.' });
        }

        // Check if already assigned
        const existCheck = await query('SELECT id FROM hifz_tracker WHERE student_id = $1', [studentId]);
        if (existCheck.rows.length > 0) {
            return res.status(400).json({ message: 'Student is already assigned to the Hifz tracker.' });
        }

        const insertQuery = `
            INSERT INTO hifz_tracker (student_id)
            VALUES ($1)
            RETURNING id, student_id, assigned_date;
        `;
        const result = await query(insertQuery, [studentId]);

        res.status(201).json({
            message: 'Student assigned to Hifz tracker successfully.',
            assignment: result.rows[0]
        });

    } catch (error) {
        console.error('Error assigning student to Hifz tracker:', error);
        res.status(500).json({ message: 'Internal server error.', error: error.message });
    }
});

// 2. Get Assigned Students API
// GET /api/hifz/students
router.get('/students', async (req, res) => {
    try {
        const getQuery = `
            SELECT 
                ht.id AS tracker_id,
                ht.student_id,
                s.name AS student_name,
                ht.current_juz,
                ht.current_surah,
                ht.assigned_date
            FROM 
                hifz_tracker ht
            JOIN 
                students s ON ht.student_id = s.id
            ORDER BY 
                ht.assigned_date DESC;
        `;
        
        const result = await query(getQuery);

        res.status(200).json(result.rows);

    } catch (error) {
        console.error('Error fetching Hifz students:', error);
        res.status(500).json({ message: 'Internal server error.', error: error.message });
    }
});

// 3. Update Progress API
// PUT /api/hifz/update/:studentId
router.put('/update/:studentId', async (req, res) => {
    try {
        const { studentId } = req.params;
        const { current_juz, current_surah } = req.body;

        if (current_juz === undefined || current_surah === undefined) {
             return res.status(400).json({ message: 'Both current_juz and current_surah are required.' });
        }

        // Check if assigned
        const existCheck = await query('SELECT id FROM hifz_tracker WHERE student_id = $1', [studentId]);
        if (existCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Student is not assigned to the Hifz tracker.' });
        }

        const updateQuery = `
            UPDATE hifz_tracker
            SET current_juz = $1, current_surah = $2
            WHERE student_id = $3
            RETURNING *;
        `;
        
        const result = await query(updateQuery, [current_juz, current_surah, studentId]);

        res.status(200).json({
            message: 'Progress updated successfully.',
            tracker: result.rows[0]
        });

    } catch (error) {
        console.error('Error updating Hifz progress:', error);
        res.status(500).json({ message: 'Internal server error.', error: error.message });
    }
});

module.exports = router;
