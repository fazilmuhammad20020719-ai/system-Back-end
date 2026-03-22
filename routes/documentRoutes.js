const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { query } = require('../db');
const { documentUpload } = require('../middleware/uploadMiddleware');
const { logActivity } = require('../utils/activityLogger');

// 1. GET: All Documents
router.get('/', async (req, res) => {
    try {
        const result = await query('SELECT * FROM documents ORDER BY upload_date DESC');
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching general documents:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 2. POST: Upload Document
router.post('/', documentUpload, async (req, res) => {
    try {
        const { name, category, type } = req.body;

        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const fileUrl = `/uploads/${req.file.filename}`;
        const sizeInMB = req.file.size / (1024 * 1024);
        const fileSize = sizeInMB < 1
            ? (req.file.size / 1024).toFixed(2) + ' KB'
            : sizeInMB.toFixed(2) + ' MB';
            
        // Use provided name or default to original filename
        const finalName = name || req.file.originalname;
        const finalCategory = category || 'root';
        const finalType = type || 'unknown';

        const result = await query(
            'INSERT INTO documents (name, file_url, type, size, category) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [finalName, fileUrl, finalType, fileSize, finalCategory]
        );

        await logActivity(
            `General document uploaded`,
            `Document "${finalName}" uploaded to category "${finalCategory}".`,
            'Upload'
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error("Error uploading general document:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 3. DELETE: Document
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const fileResult = await query('SELECT file_url, name FROM documents WHERE id = $1', [id]);

        if (fileResult.rows.length === 0) {
            return res.status(404).json({ message: 'Document not found' });
        }

        const doc = fileResult.rows[0];

        // DB Delete
        await query('DELETE FROM documents WHERE id = $1', [id]);

        // File Delete
        // Assuming 'uploads' folder is at Back-end/uploads
        const filePath = path.join(__dirname, '../uploads', path.basename(doc.file_url));
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        await logActivity(
            `General document deleted`,
            `Document "${doc.name}" was deleted from the system.`,
            'Trash2'
        );

        res.json({ message: 'Document deleted successfully' });
    } catch (err) {
        console.error("Error deleting general document:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
