const express = require('express');
const router = express.Router();
const db = require('../db');

// 1. GET ALL PROGRAMS
router.get('/', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM programs ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 2. CREATE PROGRAM
router.post('/', async (req, res) => {
    try {
        const { name, type, duration, fee } = req.body;
        const result = await db.query(
            'INSERT INTO programs (name, type, duration, fees) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, type, duration, fee]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 2.5. UPDATE PROGRAM
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, type, category, duration, fee, head } = req.body;

        // Handle field mapping
        const programType = type || category;
        const fees = fee; // Map fee to DB column (assuming 'fee' or 'fees')
        const headOfProgram = head;

        // Dynamic update to handle potential column mismatches safely or assume standard columns
        // Based on POST: name, type, duration, fee
        // Based on Frontend GET: head_of_program?
        // Let's try to update all common fields.

        const result = await db.query(
            `UPDATE programs 
             SET name = $1, type = $2, duration = $3, fees = $4, head_of_program = $5 
             WHERE id = $6 
             RETURNING *`,
            [name, programType, duration, fees, headOfProgram, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Program not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error("Error updating program:", err);
        // Fallback if head_of_program doesn't exist? 
        // We'll see if it errors.
        res.status(500).json({ message: 'Server Error' });
    }
});

// 3. DELETE PROGRAM
router.delete('/:id', async (req, res) => {
    const client = await db.pool.connect();
    try {
        const { id } = req.params;

        await client.query('BEGIN');

        // 1. Clear Program ID from Students
        await client.query('UPDATE students SET program_id = NULL WHERE program_id = $1', [id]);

        // 2. Clear Program ID from Teachers
        await client.query('UPDATE teachers SET program_id = NULL WHERE program_id = $1', [id]);

        // 3. Clear Program ID from Subjects
        // Note: If a subject belongs to a program, removing the program might make the subject orphaned.
        // Option A: Delete subjects? Option B: Set NULL?
        // Assuming we keep the subject but unassign it.
        await client.query('UPDATE subjects SET program_id = NULL WHERE program_id = $1', [id]);

        // 4. Delete Schedules (Since schedules are strictly bound to a program time)
        await client.query('DELETE FROM schedules WHERE program_id = $1', [id]);

        // 5. Delete the Program
        await client.query('DELETE FROM programs WHERE id = $1', [id]);

        await client.query('COMMIT');

        res.json({ message: 'Program deleted successfully' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error deleting program:", err);
        res.status(500).json({ message: 'Server Error' });
    } finally {
        client.release();
    }
});

module.exports = router;
