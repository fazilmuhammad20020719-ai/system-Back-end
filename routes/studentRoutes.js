const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { studentUpload } = require('../middleware/uploadMiddleware');

// --- 1. SAVE STUDENT (ADD or EDIT) ---
router.post('/', studentUpload, async (req, res) => {
    try {
        const {
            indexNumber, firstName, lastName, program, session, currentYear, status,
            dob, gender, nic, email, phone,
            address, city, district, province,
            guardianName, guardianRelation, guardianOccupation, guardianPhone, guardianEmail,
            admissionDate, previousSchoolName, mediumOfStudy,
            googleMapLink, latitude, longitude
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
router.get('/', async (req, res) => {
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
router.get('/:id', async (req, res) => {
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
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM students WHERE id = $1', [id]);
        res.json({ message: 'Student deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
