const express = require('express');
const router = express.Router();
const { query } = require('../db');

// GET All Subjects
// GET Subjects (Optional Filter by Program)
router.get('/', async (req, res) => {
    try {
        const { programId } = req.query;
        let queryText = 'SELECT * FROM subjects';
        const params = [];

        if (programId) {
            queryText += ' WHERE program_id = $1';
            params.push(programId);
        }

        queryText += ' ORDER BY id ASC';

        const result = await query(queryText, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// POST Create Subject
router.post('/', async (req, res) => {
    try {
        const { name, programId, year, teacherId } = req.body;
        const result = await query(
            'INSERT INTO subjects (name, program_id, year, teacher_id) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, programId, year, teacherId || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// PUT Update Subject
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, programId, year, teacherId } = req.body;
        const result = await query(
            'UPDATE subjects SET name=$1, program_id=$2, year=$3, teacher_id=$4 WHERE id=$5 RETURNING *',
            [name, programId, year, teacherId || null, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: 'Subject not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// DELETE Subject
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM subjects WHERE id = $1', [id]);
        res.json({ message: 'Subject deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
