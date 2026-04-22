const express = require('express');
const router = express.Router();
const { query } = require('../db');

// GET all notes
router.get('/', async (req, res) => {
    try {
        const result = await query('SELECT * FROM notes ORDER BY is_pinned DESC, updated_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching notes:", err);
        res.status(500).json({ message: "Server error fetching notes" });
    }
});

// POST a new note
router.post('/', async (req, res) => {
    try {
        const { title, content, color_theme, is_pinned } = req.body;
        const result = await query(
            'INSERT INTO notes (title, content, color_theme, is_pinned, updated_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
            [title || 'Untitled Note', content || '', color_theme || 'white', is_pinned || false]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error("Error creating note:", err);
        res.status(500).json({ message: "Server error creating note" });
    }
});

// PUT (update) a note
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, color_theme, is_pinned } = req.body;
        const result = await query(
            'UPDATE notes SET title = $1, content = $2, color_theme = $3, is_pinned = $4, updated_at = NOW() WHERE id = $5 RETURNING *',
            [title, content, color_theme, is_pinned || false, id]
        );
        
        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Note not found" });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Error updating note:", err);
        res.status(500).json({ message: "Server error updating note" });
    }
});

// DELETE a note
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query('DELETE FROM notes WHERE id = $1 RETURNING *', [id]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Note not found" });
        }
        res.json({ message: "Note deleted successfully", note: result.rows[0] });
    } catch (err) {
        console.error("Error deleting note:", err);
        res.status(500).json({ message: "Server error deleting note" });
    }
});

module.exports = router;
