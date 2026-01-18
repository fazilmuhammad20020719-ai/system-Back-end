const jwt = require('jsonwebtoken'); // டோக்கன் உருவாக்க
const auth = require('./credentials.js'); // லாகின் விவரங்களை அழைக்க
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

// --- MIGRATION CHECK ---
// This runs on startup to ensure the schema is up to date, 
// fixing the "column does not exist" error automatically.
const runMigrations = async () => {
    const alterQueries = [
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS dob DATE;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS gender VARCHAR(20);",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS nic VARCHAR(20);",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS email VARCHAR(100);",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url TEXT;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS address TEXT;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS city VARCHAR(100);",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS district VARCHAR(100);",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS province VARCHAR(100);",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_relation VARCHAR(50);",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_occupation VARCHAR(100);",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_phone VARCHAR(20);",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS admission_date DATE;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS previous_school VARCHAR(100);",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS medium_of_study VARCHAR(50);",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS nic_front TEXT;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS nic_back TEXT;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS student_signature TEXT;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS birth_certificate TEXT;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS medical_report TEXT;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_nic TEXT;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_photo TEXT;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS leaving_certificate TEXT;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS google_map_link TEXT;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8);",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);",
        `CREATE TABLE IF NOT EXISTS subjects (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            program_id INTEGER REFERENCES programs(id),
            year VARCHAR(50),
            teacher_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`
    ];

    try {
        const client = await pool.connect();
        try {
            for (const q of alterQueries) {
                await client.query(q);
            }
            console.log("Database schema checked/updated successfully.");
        } finally {
            client.release();
        }
    } catch (err) {
        console.error("Migration warning:", err.message);
    }
};

runMigrations();

const query = (text, params) => pool.query(text, params);

// ==========================================
//              API ENDPOINTS
// ==========================================

// --- 0. LOGIN API (புதிதாக சேர்க்கப்பட்டது) ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    // credentials.js கோப்பில் உள்ள விவரங்களுடன் ஒப்பிடுதல்
    if (username === auth.adminUser && password === auth.adminPass) {

        // லாகின் வெற்றிகரமாக முடிந்தால் டோக்கன் உருவாக்குதல்
        const token = jwt.sign(
            { user: username },
            process.env.JWT_SECRET || 'your_secret_key_123',
            { expiresIn: '12h' }
        );

        return res.json({
            message: 'Login successful',
            token: token,
            user: { username: username, role: 'admin' }
        });
    } else {
        // விவரங்கள் தவறாக இருந்தால்
        return res.status(400).json({ message: 'Invalid Username or Password' });
    }
});

// --- 1. SAVE STUDENT (ADD or EDIT) with MULTIPLE FILES ---
// --- 1. SAVE STUDENT (ADD or EDIT) with MULTIPLE FILES ---
app.post('/api/students', cpUpload, async (req, res) => {
    try {
        // Text Data from FormData
        const {
            indexNumber, firstName, lastName, program, session, currentYear, status,
            dob, gender, nic, email, phone,
            address, city, district, province,
            guardianName, guardianRelation, guardianOccupation, guardianPhone, guardianEmail,
            admissionDate, previousSchoolName, mediumOfStudy,
            googleMapLink,
            latitude, longitude
        } = req.body;

        const getFilePath = (fieldName) => {
            if (req.files && req.files[fieldName]) {
                return `/uploads/${req.files[fieldName][0].filename}`;
            }
            return null;
        };

        const photoUrl = getFilePath('studentPhoto');
        const nicFront = getFilePath('nicFront');
        const nicBack = getFilePath('nicBack');
        const studentSignature = getFilePath('studentSignature');
        const birthCertificate = getFilePath('birthCertificate');
        const medicalReport = getFilePath('medicalReport');
        const guardianNic = getFilePath('guardianNic');
        const guardianPhoto = getFilePath('guardianPhoto');
        const leavingCertificate = getFilePath('leavingCertificate');


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
        // Note: We use COALESCE($param, column_name) for files so that if no new file is uploaded (null),
        // we keep the existing one on UPDATE. For INSERT, it will be null if not provided.
        // However, standard SQL COALESCE won't work exactly like that in VALUES clause for upsert unless we handle it in the ON CONFLICT part carefully.
        // For ON CONFLICT, we want: new_val OR old_val.
        // But for INSERT, we just want new_val.

        const queryText = `
            INSERT INTO students (
                id, name, program_id, current_year, session_year, status, contact_number,
                dob, gender, nic, email, photo_url,
                address, city, district, province,
                guardian_name, guardian_relation, guardian_occupation, guardian_phone,
                admission_date, previous_school, medium_of_study,
                nic_front, nic_back, student_signature, birth_certificate, medical_report, 
                guardian_nic, guardian_photo, leaving_certificate,
                google_map_link, latitude, longitude
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8, $9, $10, $11, $12,
                $13, $14, $15, $16,
                $17, $18, $19, $20,
                $21, $22, $23,
                $24, $25, $26, $27, $28, $29, $30, $31,
                $32, $33, $34
            )
            ON CONFLICT (id) DO UPDATE SET 
                name=$2, program_id=$3, current_year=$4, session_year=$5, status=$6, contact_number=$7,
                dob=$8, gender=$9, nic=$10, email=$11, 
                photo_url = COALESCE($12, students.photo_url), 
                address=$13, city=$14, district=$15, province=$16,
                guardian_name=$17, guardian_relation=$18, guardian_occupation=$19, guardian_phone=$20,
                admission_date=$21, previous_school=$22, medium_of_study=$23,
                nic_front = COALESCE($24, students.nic_front),
                nic_back = COALESCE($25, students.nic_back),
                student_signature = COALESCE($26, students.student_signature),
                birth_certificate = COALESCE($27, students.birth_certificate),
                medical_report = COALESCE($28, students.medical_report),
                guardian_nic = COALESCE($29, students.guardian_nic),
                guardian_photo = COALESCE($30, students.guardian_photo),
                leaving_certificate = COALESCE($31, students.leaving_certificate),
                google_map_link = $32,
                latitude = $33,
                longitude = $34
        `;

        const values = [
            indexNumber, fullName, programId, currentYear, session, status || 'Active', phone,
            dob || null, gender, nic, email, photoUrl,
            address, city, district, province,
            guardianName, guardianRelation, guardianOccupation, guardianPhone,
            admissionDate || null, previousSchoolName, mediumOfStudy,
            nicFront, nicBack, studentSignature, birthCertificate, medicalReport,
            guardianNic, guardianPhoto, leavingCertificate,
            googleMapLink || null,
            latitude || null,
            longitude || null
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

// --- 6. SUBJECTS API (RESTORED) ---

// GET All Subjects
app.get('/api/subjects', async (req, res) => {
    try {
        const result = await query('SELECT * FROM subjects ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// POST Create Subject
app.post('/api/subjects', async (req, res) => {
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
app.put('/api/subjects/:id', async (req, res) => {
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
app.delete('/api/subjects/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM subjects WHERE id = $1', [id]);
        res.json({ message: 'Subject deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// --- START SERVER ---
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});