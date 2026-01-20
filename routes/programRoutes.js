const express = require('express');
const router = express.Router();
const { query } = require('../db');

// 1. GET ALL PROGRAMS
router.get('/', async (req, res) => {
    try {
        const result = await query('SELECT * FROM programs ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 2. GET SINGLE PROGRAM
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query('SELECT * FROM programs WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Program not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 3. CREATE NEW PROGRAM
router.post('/', async (req, res) => {
    try {
        const { name, head, duration, fee, status, category } = req.body;
        const result = await query(
            `INSERT INTO programs (name, head_of_program, duration, fees, status, category) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [name, head, duration, fee, status || 'Active', category]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 4. UPDATE PROGRAM
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, head, duration, fee, status, category } = req.body;

        const result = await query(
            `UPDATE programs 
             SET name=$1, head_of_program=$2, duration=$3, fees=$4, status=$5, category=$6 
             WHERE id=$7 RETURNING *`,
            [name, head, duration, fee, status, category, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Program not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 5. DELETE PROGRAM
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Optional: First delete related subjects (Safety Step)
        await query('DELETE FROM subjects WHERE program_id = $1', [id]);

        // Delete the program
        const result = await query('DELETE FROM programs WHERE id = $1 RETURNING *', [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Program not found' });
        }
        res.json({ message: 'Program deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error. Program may have linked students.' });
    }
});

module.exports = router;
