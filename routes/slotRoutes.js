const express = require('express');
const router = express.Router();
const { query } = require('../db');

// GET All Slots
router.get('/', async (req, res) => {
    try {
        const result = await query(`
            SELECT s.*, p.name as program_name 
            FROM examination_slots s
            LEFT JOIN programs p ON s.program_id = p.id
            ORDER BY s.start_date DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// POST Create Slot
router.post('/', async (req, res) => {
    try {
        const { name, programId, startDate, endDate, status } = req.body;
        const result = await query(
            `INSERT INTO examination_slots (name, program_id, start_date, end_date, status)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [name, programId, startDate, endDate, status || 'Upcoming']
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// PUT Update Slot
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, programId, startDate, endDate, status } = req.body;
        const result = await query(
            `UPDATE examination_slots 
             SET name=$1, program_id=$2, start_date=$3, end_date=$4, status=$5
             WHERE id=$6
             RETURNING *`,
            [name, programId, startDate, endDate, status, id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// DELETE Slot
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM examination_slots WHERE id = $1', [id]);
        res.json({ message: 'Slot deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
