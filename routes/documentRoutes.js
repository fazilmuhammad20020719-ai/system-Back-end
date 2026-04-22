const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { query } = require('../db');
const { documentUpload } = require('../middleware/uploadMiddleware');
const { logActivity } = require('../utils/activityLogger');

// ─────────────────────────────────────────────────────────────────────────────
// FOLDER ROUTES  (must be defined BEFORE /:id routes to avoid conflicts)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/documents/folders/all  →  return all folders
router.get('/folders/all', async (req, res) => {
    try {
        // Ensure table exists before querying (safe on first run before migrations)
        await query(`
            CREATE TABLE IF NOT EXISTS document_folders (
                id         VARCHAR(100) PRIMARY KEY,
                name       VARCHAR(255) NOT NULL,
                parent_id  VARCHAR(100) NOT NULL DEFAULT 'root',
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        const result = await query(
            "SELECT * FROM document_folders ORDER BY created_at ASC"
        );
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching folders:", err);
        // Return empty array instead of crashing — frontend handles gracefully
        res.json([]);
    }
});

// POST /api/documents/folders  →  create a new folder
router.post('/folders', async (req, res) => {
    try {
        const { name, parent_id } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Folder name is required' });
        }

        // Ensure the folders table exists (idempotent)
        await query(`
            CREATE TABLE IF NOT EXISTS document_folders (
                id   VARCHAR(100) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                parent_id VARCHAR(100) NOT NULL DEFAULT 'root',
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        const folderId = `folder_${Date.now()}`;
        const result = await query(
            'INSERT INTO document_folders (id, name, parent_id) VALUES ($1, $2, $3) RETURNING *',
            [folderId, name.trim(), parent_id || 'root']
        );

        await logActivity(
            `Folder created`,
            `Folder "${name.trim()}" was created.`,
            'Folder'
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error("Error creating folder:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// PUT /api/documents/folders/:id  →  rename a folder
router.put('/folders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Folder name is required' });
        }

        const result = await query(
            'UPDATE document_folders SET name = $1 WHERE id = $2 RETURNING *',
            [name.trim(), id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Folder not found' });
        }

        await logActivity(
            `Folder renamed`,
            `Folder ID "${id}" was renamed to "${name.trim()}".`,
            'Edit'
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error("Error renaming folder:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// DELETE /api/documents/folders/:id  →  delete folder; files inside move to root
router.delete('/folders/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const folderResult = await query('SELECT * FROM document_folders WHERE id = $1', [id]);
        if (folderResult.rows.length === 0) {
            return res.status(404).json({ message: 'Folder not found' });
        }
        const folder = folderResult.rows[0];

        // Move all documents inside this folder back to root
        await query("UPDATE documents SET category = 'root' WHERE category = $1", [id]);

        // Move all subfolders up to root to prevent orphaning
        await query("UPDATE document_folders SET parent_id = 'root' WHERE parent_id = $1", [id]);

        // Delete the folder
        await query('DELETE FROM document_folders WHERE id = $1', [id]);

        await logActivity(
            `Folder deleted`,
            `Folder "${folder.name}" was deleted. Its files were moved to root.`,
            'Trash2'
        );

        res.json({ message: 'Folder deleted successfully' });
    } catch (err) {
        console.error("Error deleting folder:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT ROUTES
// ─────────────────────────────────────────────────────────────────────────────

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

// 3. PUT: Update Document  (rename, move, pin, star, trash, restore)
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body; // e.g. { category: 'folder_xyz' } or { name: 'new name' } etc.

        if (!updates || Object.keys(updates).length === 0) {
            return res.status(400).json({ message: 'No update fields provided' });
        }

        // Build a dynamic SET clause
        const allowedFields = ['name', 'category', 'starred', 'pinned', 'trashed'];
        const setClauses = [];
        const values = [];
        let idx = 1;

        for (const field of allowedFields) {
            if (field in updates) {
                setClauses.push(`${field} = $${idx}`);
                values.push(updates[field]);
                idx++;
            }
        }

        if (setClauses.length === 0) {
            return res.status(400).json({ message: 'No valid update fields provided' });
        }

        values.push(id); // last placeholder for WHERE id = $n
        const sql = `UPDATE documents SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;

        const result = await query(sql, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Document not found' });
        }

        await logActivity(
            `Document updated`,
            `Document ID ${id} was updated: ${JSON.stringify(updates)}.`,
            'Edit'
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error("Error updating document:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 4. POST: Copy Document to another folder
router.post('/:id/copy', async (req, res) => {
    try {
        const { id } = req.params;
        const { category } = req.body;

        if (!category) {
            return res.status(400).json({ message: 'Target folder (category) is required' });
        }

        // Fetch the original document
        const original = await query('SELECT * FROM documents WHERE id = $1', [id]);

        if (original.rows.length === 0) {
            return res.status(404).json({ message: 'Document not found' });
        }

        const doc = original.rows[0];
        const copyName = `${doc.name} (Copy)`;

        // Insert a new record pointing to the same file_url but in the new category
        const result = await query(
            'INSERT INTO documents (name, file_url, type, size, category) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [copyName, doc.file_url, doc.type, doc.size, category]
        );

        await logActivity(
            `Document copied`,
            `Document "${doc.name}" was copied to category "${category}" as "${copyName}".`,
            'Copy'
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error("Error copying document:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 5. DELETE: Document
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const fileResult = await query('SELECT file_url, name FROM documents WHERE id = $1', [id]);

        if (fileResult.rows.length === 0) {
            return res.status(404).json({ message: 'Document not found' });
        }

        const doc = fileResult.rows[0];

        await query('DELETE FROM documents WHERE id = $1', [id]);

        // Only delete the physical file if no other records share the same URL (i.e. copied files)
        const sharingCount = await query('SELECT COUNT(*) FROM documents WHERE file_url = $1', [doc.file_url]);
        if (parseInt(sharingCount.rows[0].count, 10) === 0) {
            const filePath = path.join(__dirname, '../uploads', path.basename(doc.file_url));
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
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