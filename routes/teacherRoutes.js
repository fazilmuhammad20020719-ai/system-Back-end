const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { query } = require('../db');
const { teacherUpload, documentUpload } = require('../middleware/uploadMiddleware');

// 1. GET ALL TEACHERS
router.get('/', async (req, res) => {
    try {
        const result = await query(`
            SELECT 
                t.id, t.emp_id, t.name, t.program_id, t.teacher_category, t.assigned_programs,
                t.designation, t.email, t.phone, t.whatsapp, t.address, t.nic, t.dob, t.gender,
                t.marital_status, t.joining_date, t.qualification, t.degree_institute, t.grad_year,
                t.appointment_type, t.previous_experience, t.department, t.basic_salary,
                t.bank_name, t.account_number, t.photo_url, t.cv_url, t.certificates_url,
                t.nic_copy_url, t.nic_front_url, t.nic_back_url, t.birth_certificate_url, t.status, t.created_at,
                p.name as program_name
            FROM teachers t
            LEFT JOIN programs p ON t.program_id = p.id
            ORDER BY t.id ASC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching teachers:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// TEMPORARY FIX ROUTE
router.get('/fix-gce-ol-data', async (req, res) => {
    try {
        const result = await query('SELECT id, name, assigned_programs FROM teachers');
        let count = 0;
        let details = [];

        for (const t of result.rows) {
            if (t.assigned_programs && t.assigned_programs.includes('GCE O/L')) {
                const original = t.assigned_programs;
                // Remove "GCE O/L" and deduplicate in one go
                let parts = t.assigned_programs.split(',').map(p => p.trim()).filter(Boolean);
                parts = parts.filter(p => p !== 'GCE O/L');
                parts = [...new Set(parts)];

                const newPrograms = parts.join(', ');

                if (original !== newPrograms) {
                    await query('UPDATE teachers SET assigned_programs = $1 WHERE id = $2', [newPrograms, t.id]);
                    count++;
                    details.push({ name: t.name, from: original, to: newPrograms });
                }
            }
        }
        res.json({ message: `Fixed ${count} teachers`, details });
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

// 2. GET SINGLE TEACHER
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query(`
            SELECT 
                t.id, t.emp_id, t.name, t.program_id, t.teacher_category, t.assigned_programs,
                t.designation, t.email, t.phone, t.whatsapp, t.address, t.nic, t.dob, t.gender,
                t.marital_status, t.joining_date, t.qualification, t.degree_institute, t.grad_year,
                t.appointment_type, t.previous_experience, t.department, t.basic_salary,
                t.bank_name, t.account_number, t.photo_url, t.cv_url, t.certificates_url,
                t.nic_copy_url, t.nic_front_url, t.nic_back_url, t.birth_certificate_url, t.status, t.created_at,
                p.name as program_name
            FROM teachers t
            LEFT JOIN programs p ON t.program_id = p.id
            WHERE t.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Teacher not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Error fetching teacher:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 2.1 GET TEACHER STATS
router.get('/:id/stats', async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Classes Assigned (Count of subjects where teacher_id matches)
        const subjectsResult = await query('SELECT COUNT(*) FROM subjects WHERE teacher_id = $1', [id]);
        const classesAssigned = parseInt(subjectsResult.rows[0].count);

        // 2. Total Students (Count of students in the same program as the teacher)
        // Fetch teacher's program_id first
        const teacherRes = await query('SELECT program_id FROM teachers WHERE id = $1', [id]);
        let totalStudents = 0;

        if (teacherRes.rows.length > 0 && teacherRes.rows[0].program_id) {
            const studentsRes = await query('SELECT COUNT(*) FROM students WHERE program_id = $1', [teacherRes.rows[0].program_id]);
            totalStudents = parseInt(studentsRes.rows[0].count);
        }

        // 3. Avg Attendance (Placeholder)
        const avgAttendance = "0%";

        res.json({
            classesAssigned,
            totalStudents,
            avgAttendance
        });

    } catch (err) {
        console.error("Error fetching teacher stats:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 3. CREATE TEACHER
router.post('/', teacherUpload, async (req, res) => {
    try {
        const {
            empId, name, program, teacherCategory, designation, email, phone, whatsapp,
            address, nic, dob, gender, maritalStatus,
            joiningDate, qualification, degreeInstitute, gradYear,
            appointmentType, previousExperience, department,
            basicSalary, bankName, accountNumber, status,
            assignedPrograms // Array or String
        } = req.body;

        const getFilePath = (fieldName) => {
            if (req.files && req.files[fieldName]) {
                return `/uploads/${req.files[fieldName][0].filename}`;
            }
            return null;
        };

        const photoUrl = getFilePath('profilePhoto');
        const cvUrl = getFilePath('cvFile');
        const certificatesUrl = getFilePath('qualification') || getFilePath('certificates'); // Handle 'qualification' input
        const nicCopyUrl = getFilePath('nicCopy'); // Legacy or full copy
        const nicFrontUrl = getFilePath('nicFront');
        const nicBackUrl = getFilePath('nicBack');
        const birthCertificateUrl = getFilePath('birthCertificate');

        // Resolve program_id if program name is sent
        let programId = null;
        if (program) {
            if (!isNaN(program)) {
                programId = parseInt(program);
            } else {
                const progResult = await query('SELECT id FROM programs WHERE name ILIKE $1', [`%${program}%`]);
                if (progResult.rows.length > 0) {
                    programId = progResult.rows[0].id;
                }
            }
        }

        // Turn Array into comma-separated String
        const programsString = Array.isArray(assignedPrograms) ? assignedPrograms.join(', ') : assignedPrograms;

        const queryText = `
            INSERT INTO teachers (
                emp_id, name, program_id, teacher_category, assigned_programs, 
                designation, email, phone, whatsapp,
                address, nic, dob, gender, marital_status,
                joining_date, qualification, degree_institute, grad_year,
                appointment_type, previous_experience, department,
                basic_salary, bank_name, account_number, 
                photo_url, cv_url, certificates_url, nic_copy_url, nic_front_url, nic_back_url, birth_certificate_url, status
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
                $11, $12, $13, $14, $15, $16, $17, $18, 
                $19, $20, $21, $22, $23, $24, $25, $26, 
                $27, $28, $29, $30, $31, $32
            ) RETURNING *
        `;

        const values = [
            empId, name, programId, teacherCategory, programsString,
            designation, email, phone, whatsapp,
            address, nic, dob || null, gender, maritalStatus,
            joiningDate || null, qualification, degreeInstitute, gradYear,
            appointmentType, previousExperience, department,

            basicSalary || 0, bankName, accountNumber,
            photoUrl, cvUrl, certificatesUrl, nicCopyUrl, nicFrontUrl, nicBackUrl, birthCertificateUrl, status || 'Active'
        ];

        const result = await query(queryText, values);
        res.status(201).json(result.rows[0]);

    } catch (err) {
        console.error("Error creating teacher:", err);
        res.status(500).json({ message: 'Server Error: ' + err.message });
    }
});

// 4. UPDATE TEACHER
router.put('/:id', teacherUpload, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            empId, name, program, teacherCategory, designation, email, phone, whatsapp,
            address, nic, dob, gender, maritalStatus,
            joiningDate, qualification, degreeInstitute, gradYear,
            appointmentType, previousExperience, department,
            basicSalary, bankName, accountNumber, status,
            assignedPrograms
        } = req.body;

        const getFilePath = (fieldName) => {
            if (req.files && req.files[fieldName]) {
                return `/uploads/${req.files[fieldName][0].filename}`;
            }
            return null;
        };

        const photoUrl = getFilePath('profilePhoto');
        const cvUrl = getFilePath('cvFile');
        const certificatesUrl = getFilePath('qualification') || getFilePath('certificates');
        const nicCopyUrl = getFilePath('nicCopy');
        const nicFrontUrl = getFilePath('nicFront');
        const nicBackUrl = getFilePath('nicBack');
        const birthCertificateUrl = getFilePath('birthCertificate');

        let programId = null;
        if (program) {
            if (!isNaN(program)) {
                programId = parseInt(program);
            } else {
                const progResult = await query('SELECT id FROM programs WHERE name ILIKE $1', [`%${program}%`]);
                if (progResult.rows.length > 0) {
                    programId = progResult.rows[0].id;
                }
            }
        }

        const programsString = Array.isArray(assignedPrograms) ? assignedPrograms.join(', ') : assignedPrograms;

        const queryText = `
            UPDATE teachers 
            SET 
                emp_id=$1, name=$2, program_id=$3, teacher_category=$4, assigned_programs=$5,
                designation=$6, email=$7, phone=$8, whatsapp=$9,
                address=$10, nic=$11, dob=$12, gender=$13, marital_status=$14,
                joining_date=$15, qualification=$16, degree_institute=$17, grad_year=$18,
                appointment_type=$19, previous_experience=$20, department=$21,
                basic_salary=$22, bank_name=$23, account_number=$24,
                photo_url = COALESCE($25, photo_url),
                cv_url = COALESCE($26, cv_url),
                certificates_url = COALESCE($27, certificates_url),
                nic_copy_url = COALESCE($28, nic_copy_url),
                status = $29,
                nic_front_url = COALESCE($30, nic_front_url),
                nic_back_url = COALESCE($31, nic_back_url),
                birth_certificate_url = COALESCE($32, birth_certificate_url)
            WHERE id=$33
            RETURNING *
        `;

        const values = [
            empId, name, programId, teacherCategory, programsString,
            designation, email, phone, whatsapp,
            address, nic, dob || null, gender, maritalStatus,
            joiningDate || null, qualification, degreeInstitute, gradYear,
            appointmentType, previousExperience, department,
            basicSalary || 0, bankName, accountNumber,
            photoUrl, cvUrl, certificatesUrl, nicCopyUrl, status,
            nicFrontUrl, nicBackUrl, birthCertificateUrl,
            id
        ];

        const result = await query(queryText, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Teacher not found' });
        }
        res.json(result.rows[0]);

    } catch (err) {
        console.error("Error updating teacher:", err);
        res.status(500).json({ message: 'Server Error: ' + err.message });
    }
});

// 5. DELETE TEACHER
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query('DELETE FROM teachers WHERE id = $1 RETURNING *', [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Teacher not found' });
        }
        // Optionally delete files from filesystem here using fs.unlink
        res.json({ message: 'Teacher deleted successfully' });
    } catch (err) {
        console.error("Error deleting teacher:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ==========================================
//        TEACHER DOCUMENT API ROUTES
// ==========================================

// 1. GET: Documents
router.get('/:id/documents', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query(
            'SELECT * FROM teacher_documents WHERE teacher_id = $1 ORDER BY created_at DESC',
            [id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching documents:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 2. POST: Upload Document
router.post('/:id/documents', documentUpload, async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const fileUrl = `/uploads/${req.file.filename}`;
        const sizeInMB = req.file.size / (1024 * 1024);
        const fileSize = sizeInMB < 1
            ? (req.file.size / 1024).toFixed(2) + ' KB'
            : sizeInMB.toFixed(2) + ' MB';

        const result = await query(
            'INSERT INTO teacher_documents (teacher_id, name, file_url, file_size) VALUES ($1, $2, $3, $4) RETURNING *',
            [id, name || req.file.originalname, fileUrl, fileSize]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error("Error uploading document:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 3. PUT: Edit Document Name
router.put('/:id/documents/:docId', async (req, res) => {
    try {
        const { docId } = req.params;
        const { name } = req.body;

        const result = await query(
            'UPDATE teacher_documents SET name = $1 WHERE id = $2 RETURNING *',
            [name, docId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Document not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Error updating document:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 4. DELETE: Document
router.delete('/:id/documents/:docId', async (req, res) => {
    try {
        const { docId } = req.params;

        const fileResult = await query('SELECT file_url FROM teacher_documents WHERE id = $1', [docId]);

        if (fileResult.rows.length === 0) {
            return res.status(404).json({ message: 'Document not found' });
        }

        const fileUrl = fileResult.rows[0].file_url;

        // DB Delete
        await query('DELETE FROM teacher_documents WHERE id = $1', [docId]);

        // File Delete
        // Assuming 'uploads' folder is relative to this router file or server root.
        // We'll traverse up to root/uploads
        const filePath = path.join(__dirname, '../uploads', path.basename(fileUrl));
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.json({ message: 'Document deleted successfully' });
    } catch (err) {
        console.error("Error deleting document:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
