const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// --- 1. SETUP UPLOADS FOLDER ---
// 'uploads' என்ற ஃபோல்டர் இல்லை என்றால் உருவாக்கவும்
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// போட்டோக்களை வெளியுலகிற்கு (Browser) காட்ட வழி செய்தல்
// http://localhost:5000/uploads/image.jpg என்று அணுகலாம்
app.use('/uploads', express.static('uploads'));

// --- 2. MULTER CONFIGURATION (FILE UPLOAD) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Save files in 'uploads' folder
    },
    filename: (req, file, cb) => {
        // Unique File Name: fieldname-timestamp-random.ext
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// --- DATABASE CONNECTION ---
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

const query = (text, params) => pool.query(text, params);

// ==========================================
//              API ENDPOINTS
// ==========================================

// --- 1. SAVE STUDENT (ADD or EDIT) with PHOTO ---
app.post('/api/students', upload.single('studentPhoto'), async (req, res) => {
    try {
        // Text Data from FormData
        const {
            indexNumber, firstName, lastName, program, session, currentYear, status,
            dob, gender, nic, email, phone,
            address, city, district, province,
            guardianName, guardianRelation, guardianOccupation, guardianPhone, guardianEmail,
            admissionDate, previousSchoolName, mediumOfStudy
        } = req.body;

        // File Data (Photo Handling)
        let photoUrl = null;
        if (req.file) {
            // New photo uploaded -> Create URL path
            photoUrl = `/uploads/${req.file.filename}`;
        }

        // Basic Validation
        if (!indexNumber || !firstName) {
            return res.status(400).json({ message: 'Index number and name are required' });
        }

        const fullName = `${firstName} ${lastName}`.trim();

        // Find Program ID based on name
        let programId = null;
        if (program) {
            const progResult = await query('SELECT id FROM programs WHERE name ILIKE $1', [`%${program}%`]);
            if (progResult.rows.length > 0) {
                programId = progResult.rows[0].id;
            }
        }

        // --- SQL QUERY (UPSERT) ---
        // COALESCE($12, students.photo_url) -> புதிய போட்டோ இருந்தால் அதை வை, இல்லையென்றால் பழையதை வை.
        const queryText = `
            INSERT INTO students (
                id, name, program_id, current_year, session_year, status, contact_number,
                dob, gender, nic, email, photo_url,
                address, city, district, province,
                guardian_name, guardian_relation, guardian_occupation, guardian_phone,
                admission_date, previous_school, medium_of_study
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8, $9, $10, $11, $12,
                $13, $14, $15, $16,
                $17, $18, $19, $20,
                $21, $22, $23
            )
            ON CONFLICT (id) DO UPDATE SET 
                name=$2, program_id=$3, current_year=$4, session_year=$5, status=$6, contact_number=$7,
                dob=$8, gender=$9, nic=$10, email=$11, 
                photo_url=COALESCE($12, students.photo_url), 
                address=$13, city=$14, district=$15, province=$16,
                guardian_name=$17, guardian_relation=$18, guardian_occupation=$19, guardian_phone=$20,
                admission_date=$21, previous_school=$22, medium_of_study=$23
        `;

        const values = [
            indexNumber, fullName, programId, currentYear, session, status || 'Active', phone,
            dob || null, gender, nic, email, photoUrl, // $12 is photoUrl (null if no new photo)
            address, city, district, province,
            guardianName, guardianRelation, guardianOccupation, guardianPhone,
            admissionDate || null, previousSchoolName, mediumOfStudy
        ];

        await query(queryText, values);

        // Optional: Log Activity
        // await query(`INSERT INTO activities (title, description, icon_type) VALUES ($1, $2, 'UserPlus')`, ['Student Update', `${fullName} record updated/added`]);

        res.status(201).json({ message: 'Student details saved successfully' });

    } catch (err) {
        console.error("Error saving student:", err);
        res.status(500).json({ message: 'Server error: ' + err.message });
    }
});

// --- 2. GET ALL STUDENTS ---
app.get('/api/students', async (req, res) => {
    try {
        const result = await query(`
            SELECT s.id, s.name, s.current_year as "currentYear", s.status, s.contact_number as contact, 
                   p.name as program, s.session_year as session, s.photo_url, s.guardian_name as guardian
            FROM students s
            LEFT JOIN programs p ON s.program_id = p.id
            ORDER BY s.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- 3. GET SINGLE STUDENT BY ID ---
app.get('/api/students/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query(`
            SELECT s.*, p.name as program_name, p.duration as program_duration
            FROM students s
            LEFT JOIN programs p ON s.program_id = p.id
            WHERE s.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Student not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- 4. DELETE STUDENT ---
app.delete('/api/students/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // Optional: Delete photo file from folder before deleting record
        // const fileRes = await query('SELECT photo_url FROM students WHERE id = $1', [id]);
        // if(fileRes.rows.length > 0 && fileRes.rows[0].photo_url) { ... fs.unlink ... }

        await query('DELETE FROM students WHERE id = $1', [id]);
        res.json({ message: 'Student deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- 5. GET PROGRAMS (For Dropdown) ---
app.get('/api/programs', async (req, res) => {
    try {
        const result = await query('SELECT * FROM programs ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// --- START SERVER ---
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});