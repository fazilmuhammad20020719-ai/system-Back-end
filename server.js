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
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// போட்டோக்களை வெளியுலகிற்கு (Browser) காட்ட வழி செய்தல்
app.use('/uploads', express.static('uploads'));

// --- 2. MULTER CONFIGURATION (FILE UPLOAD) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// பல ஃபைல்களை ஏற்பதற்கான அமைப்பு
const cpUpload = upload.fields([
    { name: 'studentPhoto', maxCount: 1 },
    { name: 'nicFront', maxCount: 1 },
    { name: 'nicBack', maxCount: 1 },
    { name: 'studentSignature', maxCount: 1 },
    { name: 'birthCertificate', maxCount: 1 },
    { name: 'medicalReport', maxCount: 1 },
    { name: 'guardianNic', maxCount: 1 },
    { name: 'guardianPhoto', maxCount: 1 },
    { name: 'leavingCertificate', maxCount: 1 }
]);

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

// --- 1. SAVE STUDENT (ADD or EDIT) with MULTIPLE FILES ---
app.post('/api/students', cpUpload, async (req, res) => {
    try {
        // Text Data from FormData
        const {
            indexNumber, firstName, lastName, program, session, currentYear, status,
            dob, gender, nic, email, phone,
            address, city, district, province,
            guardianName, guardianRelation, guardianOccupation, guardianPhone, guardianEmail,
            admissionDate, previousSchoolName, mediumOfStudy
        } = req.body;

        // --- FILE HANDLING ---
        // போட்டோ இருக்கிறதா என்று பார்த்து URL உருவாக்குதல்
        // குறிப்பு: req.files['field_name'] என்று அணுக வேண்டும்
        let photoUrl = null;
        if (req.files && req.files['studentPhoto']) {
            photoUrl = `/uploads/${req.files['studentPhoto'][0].filename}`;
        }

        // TODO: மற்ற ஆவணங்களையும் Database-ல் சேர்க்க விரும்பினால், 
        // கீழே உள்ளவாறு URL எடுத்து Table-ல் சேர்க்கலாம்.
        // let nicFrontUrl = req.files['nicFront'] ? `/uploads/${req.files['nicFront'][0].filename}` : null;

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
            dob || null, gender, nic, email, photoUrl,
            address, city, district, province,
            guardianName, guardianRelation, guardianOccupation, guardianPhone,
            admissionDate || null, previousSchoolName, mediumOfStudy
        ];

        await query(queryText, values);

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