const express = require('express');
const router = express.Router({ mergeParams: true });
const { query } = require('../db');
const { noteUpload } = require('../middleware/uploadMiddleware');

// ---------------------------------------------
//   GET /api/students/:id/notes
//   Fetch all notes for a student (pinned first)
// ---------------------------------------------
router.get('/', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query(
            `SELECT * FROM student_notes
             WHERE student_id = $1
             ORDER BY is_pinned DESC, created_at DESC`,
            [id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching student notes:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ---------------------------------------------
//   POST /api/students/:id/notes
//   Add a new note (optionally with photo)
// ---------------------------------------------
router.post('/', noteUpload, async (req, res) => {
    try {
        const { id } = req.params;
        const { note_type, text, author } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({ message: 'Note text is required' });
        }

        let photoUrl = null;
        if (req.file) {
            photoUrl = `/uploads/${req.file.filename}`;
        }

        const result = await query(
            `INSERT INTO student_notes (student_id, note_type, text, photo_url, author)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [id, note_type || 'General', text.trim(), photoUrl, author || 'Admin']
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error adding student note:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ---------------------------------------------
//   PUT /api/students/:id/notes/:noteId
//   Edit a note's text, type, or photo
// ---------------------------------------------
router.put('/:noteId', noteUpload, async (req, res) => {
    try {
        const { noteId } = req.params;
        const { note_type, text } = req.body;

        let photoUrl = null;
        let photoClause = '';
        const values = [note_type, text.trim(), noteId];

        if (req.file) {
            photoUrl = `/uploads/${req.file.filename}`;
            photoClause = ', photo_url = $4';
            values.splice(2, 0, photoUrl); // insert before noteId
            // Adjust: [note_type, text, photoUrl, noteId]
            const result = await query(
                `UPDATE student_notes
                 SET note_type = $1, text = $2, photo_url = $3, updated_at = NOW()
                 WHERE id = $4 RETURNING *`,
                [note_type, text.trim(), photoUrl, noteId]
            );
            if (result.rows.length === 0) return res.status(404).json({ message: 'Note not found' });
            return res.json(result.rows[0]);
        }

        const result = await query(
            `UPDATE student_notes
             SET note_type = $1, text = $2, updated_at = NOW()
             WHERE id = $3 RETURNING *`,
            [note_type, text.trim(), noteId]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: 'Note not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error editing student note:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ---------------------------------------------
//   PATCH /api/students/:id/notes/:noteId/pin
//   Toggle pin status
// ---------------------------------------------
router.patch('/:noteId/pin', async (req, res) => {
    try {
        const { noteId } = req.params;

        const result = await query(
            `UPDATE student_notes
             SET is_pinned = NOT is_pinned, updated_at = NOW()
             WHERE id = $1 RETURNING *`,
            [noteId]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: 'Note not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error toggling pin:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ---------------------------------------------
//   DELETE /api/students/:id/notes/:noteId
//   Delete a note
// ---------------------------------------------
router.delete('/:noteId', async (req, res) => {
    try {
        const { noteId } = req.params;
        const result = await query(
            'DELETE FROM student_notes WHERE id = $1 RETURNING *',
            [noteId]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: 'Note not found' });
        res.json({ message: 'Note deleted successfully' });
    } catch (err) {
        console.error('Error deleting student note:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
