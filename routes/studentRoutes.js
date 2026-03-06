const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { studentUpload, documentUpload } = require('../middleware/uploadMiddleware');
const path = require('path');
const fs = require('fs');
const { logActivity } = require('../utils/activityLogger');

// --- 1. SAVE STUDENT (ADD or EDIT) ---
router.post('/', studentUpload, async (req, res) => {
    try {
        const {
            indexNumber, firstName, lastName, program, programId: bodyProgramId, session, currentYear, status,
            dob, gender, nic, email, phone,
            address, city, district, province, dsDivision, gnDivision,
            guardianName, guardianRelation, guardianOccupation, guardianPhone, guardianEmail,
            admissionDate, previousSchoolName, mediumOfStudy, lastStudiedGrade, previousCollegeName,

            googleMapLink, latitude, longitude, whatsapp, monthlyFee
        } = req.body;

        console.log("Saving Student Data - Body:", req.body);
        console.log("Enrollments Payload:", req.body.enrollments);

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

        // Find Program ID: Use provided ID if available, otherwise lookup by name
        let programId = typeof bodyProgramId !== 'undefined' && bodyProgramId !== '' ? bodyProgramId : null;

        if (!programId && program) {
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
                google_map_link, latitude, longitude,
                    ds_division, gn_division, guardian_email, last_studied_grade, previous_college, whatsapp, monthly_fee
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8, $9, $10, $11, $12,
                $13, $14, $15, $16,
                $17, $18, $19, $20,
                $21, $22, $23,
                $24, $25, $26, $27, $28, $29, $30, $31,
                $32, $33, $34, $35, $36, $37, $38, $39, $40, $41
            )
            ON CONFLICT(id) DO UPDATE SET
            name = $2, program_id = $3, current_year = $4, session_year = $5, status = $6, contact_number = $7,
            dob = $8, gender = $9, nic = $10, email = $11,
            photo_url = COALESCE($12, students.photo_url),
            address = $13, city = $14, district = $15, province = $16,
            guardian_name = $17, guardian_relation = $18, guardian_occupation = $19, guardian_phone = $20,
            admission_date = $21, previous_school = $22, medium_of_study = $23,
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
            longitude = $34,
            ds_division = $35,
            gn_division = $36,
            guardian_email = $37,
            last_studied_grade = $38,
            previous_college = $39,
            whatsapp = $40,
            monthly_fee = $41
        `;

        // Helper: convert undefined (not sent by frontend) to null for PostgreSQL
        const nn = (v) => (v === undefined || v === '' ? null : v);

        const values = [
            indexNumber, fullName, programId, nn(currentYear), nn(session), status || 'Active', nn(phone),
            nn(dob), nn(gender), nn(nic), nn(email), photoUrl,
            nn(address), nn(city), nn(district), nn(province),
            nn(guardianName), nn(guardianRelation), nn(guardianOccupation), nn(guardianPhone),
            nn(admissionDate), nn(previousSchoolName), nn(mediumOfStudy),
            nicFront, nicBack, studentSignature, birthCertificate, medicalReport,
            guardianNic, guardianPhoto, leavingCertificate,
            nn(googleMapLink),
            nn(latitude),
            nn(longitude),
            nn(dsDivision), nn(gnDivision), nn(guardianEmail),
            nn(lastStudiedGrade), nn(previousCollegeName), nn(whatsapp), monthlyFee || 5000
        ];

        await query(queryText, values);

        // --- Handle Multi-Enrollments ---
        // Expecting req.body.enrollments as JSON string or array
        let enrollments = [];
        let enrollmentsParsed = false;
        if (req.body.enrollments) {
            try {
                enrollments = typeof req.body.enrollments === 'string'
                    ? JSON.parse(req.body.enrollments)
                    : req.body.enrollments;
                enrollmentsParsed = true;
            } catch (e) {
                // Parsing failed — warn and keep empty so fallback can run
                console.warn("Warning: enrollments JSON parse failed. Raw value:", req.body.enrollments, "Error:", e.message);
            }
        }

        // Fallback: If enrollments were not successfully parsed OR are empty,
        // and legacy fields exist, build one enrollment from them to avoid data loss
        if ((!enrollmentsParsed || enrollments.length === 0) && programId) {
            enrollments.push({
                programId: programId,
                currentYear: currentYear || '',
                session: session || '',
                status: status || 'Active',
                admissionDate: admissionDate || null
            });
        }

        // Sync Enrollments: Delete existing (simple way for full sync) and insert new
        // Ideally should be smarter (update existing), but delete-insert is safer for sync
        if (enrollments.length > 0) {
            // First, delete current enrollments
            await query('DELETE FROM student_enrollments WHERE student_id = $1', [indexNumber]);

            // Insert new ones
            for (const enr of enrollments) {
                if (!enr.programId) continue;
                await query(`
                    INSERT INTO student_enrollments (student_id, program_id, current_year, session_year, status, admission_date)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (student_id, program_id) DO UPDATE SET
                    current_year = $3, session_year = $4, status = $5, admission_date = $6
                `, [
                    indexNumber,
                    enr.programId,
                    enr.currentYear,
                    enr.session || enr.session_year,
                    enr.status || 'Active',
                    enr.admissionDate ? enr.admissionDate : null
                ]);
            }
        }

        // Check if this was an INSERT or UPDATE (check if student existed before)
        const isNew = !(await query('SELECT id FROM students WHERE id = $1', [indexNumber])).rows.length === 0;
        // We always do upsert, so check by looking at name existing. Simplest: log based on body presence.
        // Log activity
        await logActivity(
            `Student ${fullName} profile saved`,
            `Student [${indexNumber}] ${fullName} was registered or updated in the system.`,
            'UserPlus',
            programId || null
        );

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
            SELECT s.id, s.name, s.status, s.contact_number as contact, s.photo_url, s.guardian_name as guardian,
            s.dob, s.gender, s.nic, s.email,
            -- Legacy fields for backward compatibility (taking the first one found or arbitrary)
            MAX(p.name) as program, 
            MAX(se.current_year) as "currentYear", 
            MAX(se.session_year) as session,
            
            -- Aggregated Enrollments
            COALESCE(
               JSON_AGG(
                   JSON_BUILD_OBJECT(
                       'program', p.name,
                       'status', se.status,
                       'year', se.current_year,
                       'session', se.session_year
                   ) ORDER BY se.admission_date DESC
               ) FILTER (WHERE p.id IS NOT NULL),
               '[]'
            ) as enrollments_summary

            FROM students s
            LEFT JOIN student_enrollments se ON s.id = se.student_id
            LEFT JOIN programs p ON se.program_id = p.id
            GROUP BY s.id
            ORDER BY s.created_at DESC
            `);
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching students:", err);
        res.status(500).json({ message: 'Server error fetching students' });
    }
});

// --- 3. GET SINGLE STUDENT BY ID ---
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query(`
            SELECT s.*, 
            -- Legacy join for fallback
            p.name as program_name, p.duration as program_duration,
            
            -- Aggregated Enrollments (Standardized keys matching GET /)
            COALESCE(
               JSON_AGG(
                   JSON_BUILD_OBJECT(
                       'program', p_enr.name,
                       'program_id', se.program_id,
                       'year', se.current_year,
                       'session', se.session_year,
                       'status', se.status,
                       'admission_date', se.admission_date
                   ) ORDER BY se.admission_date DESC
               ) FILTER (WHERE p_enr.id IS NOT NULL),
               '[]'
            ) as enrollments

            FROM students s
            LEFT JOIN programs p ON s.program_id = p.id
            LEFT JOIN student_enrollments se ON s.id = se.student_id
            LEFT JOIN programs p_enr ON se.program_id = p_enr.id
            WHERE s.id = $1
            GROUP BY s.id, p.name, p.duration
            `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Student not found' });
        }

        const student = result.rows[0];
        // student.enrollments is now a JSON array from the query

        res.json(student);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// 5. GET STUDENT ATTENDANCE (Range)
// Example: /api/students/1001/attendance?startDate=2025-01-01&endDate=2025-01-31
router.get('/:id/attendance', async (req, res) => {
    try {
        const { id } = req.params;
        const { startDate, endDate } = req.query;

        // Fetch records for this student in the date range from student_attendance table
        const result = await query(
            `SELECT date, status 
             FROM student_attendance 
             WHERE student_id = $1 AND date >= $2 AND date <= $3`,
            [id, startDate, endDate]
        );

        // Normalize dates to YYYY-MM-DD strings
        // 'en-CA' locale is a reliable way to get YYYY-MM-DD format
        const formatted = result.rows.map(row => ({
            ...row,
            date: new Date(row.date).toLocaleDateString('en-CA')
        }));

        res.json(formatted);
    } catch (err) {
        console.error("Error fetching student attendance:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// --- 4. DELETE STUDENT ---
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Delete all related records first to avoid Foreign Key constraint violations
        await query('DELETE FROM attendance WHERE student_id = $1', [id]);
        await query('DELETE FROM student_attendance WHERE student_id = $1', [id]);
        await query('DELETE FROM student_documents WHERE student_id = $1', [id]);
        await query('DELETE FROM student_fees WHERE student_id = $1', [id]);
        await query('DELETE FROM student_enrollments WHERE student_id = $1', [id]);

        // Fetch student name before deleting
        const studentInfo = await query('SELECT name FROM students WHERE id = $1', [id]);
        const studentName = studentInfo.rows[0]?.name || id;

        // 2. Finally, delete the student
        await query('DELETE FROM students WHERE id = $1', [id]);

        await logActivity(
            `Student deleted`,
            `Student [${id}] ${studentName} was removed from the system.`,
            'Trash2'
        );

        res.json({ message: 'Student deleted successfully' });
    } catch (err) {
        console.error("Error during deletion:", err);
        res.status(500).json({ message: 'Server error during deletion' });
    }
});

// ==========================================
//        STUDENT DOCUMENT API ROUTES
// ==========================================

// 1. GET: Documents
router.get('/:id/documents', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query(
            'SELECT * FROM student_documents WHERE student_id = $1 ORDER BY created_at DESC',
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
            'INSERT INTO student_documents (student_id, name, file_url, file_size) VALUES ($1, $2, $3, $4) RETURNING *',
            [id, name || req.file.originalname, fileUrl, fileSize]
        );

        await logActivity(
            `Document uploaded for student`,
            `Document "${name || req.file.originalname}" uploaded for student ID ${id}.`,
            'Upload'
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
            'UPDATE student_documents SET name = $1 WHERE id = $2 RETURNING *',
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

        const fileResult = await query('SELECT file_url FROM student_documents WHERE id = $1', [docId]);

        if (fileResult.rows.length === 0) {
            return res.status(404).json({ message: 'Document not found' });
        }

        const fileUrl = fileResult.rows[0].file_url;

        // DB Delete
        await query('DELETE FROM student_documents WHERE id = $1', [docId]);

        // File Delete
        // Assuming 'uploads' folder is relative to this router file or server root.
        // We'll traverse up to root/uploads
        const filePath = path.join(__dirname, '../uploads', path.basename(fileUrl));
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        await logActivity(
            `Student document deleted`,
            `Document ID ${docId} was deleted from the system.`,
            'Trash2'
        );

        res.json({ message: 'Document deleted successfully' });
    } catch (err) {
        console.error("Error deleting document:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ==========================================
//        STUDENT FEES API ROUTES
// ==========================================

// 1. GET: Fees
router.get('/:id/fees', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query(
            'SELECT * FROM student_fees WHERE student_id = $1 ORDER BY created_at DESC',
            [id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching fees:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 2. POST: Add Fee Payment
router.post('/:id/fees', documentUpload, async (req, res) => {
    try {
        const { id } = req.params;
        const { month, year, amount, status, date } = req.body;

        // Handle Receipt Upload
        let receiptUrl = null;
        if (req.file) {
            receiptUrl = `/uploads/${req.file.filename}`;
        }

        const result = await query(
            `INSERT INTO student_fees (student_id, month, year, amount, status, paid_date, receipt_url) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [id, month, year, amount, status || 'Pending', date || null, receiptUrl]
        );

        if (status === 'Paid') {
            await logActivity(
                `Fee payment recorded`,
                `Student ID ${id} paid fees for ${month} ${year}. Amount: ${amount}.`,
                'DollarSign'
            );
        }

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error("Error adding fee:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 3. PUT: Edit Fee
router.put('/:id/fees/:feeId', documentUpload, async (req, res) => {
    try {
        const { feeId } = req.params;
        const { month, year, amount, status, date } = req.body;

        // Current Receipt Logic
        let receiptUrlClause = "";
        const values = [month, year, amount, status, date || null, feeId];
        let paramIndex = 7;

        if (req.file) {
            const newReceiptUrl = `/uploads/${req.file.filename}`;
            receiptUrlClause = `, receipt_url = $${paramIndex}`;
            values.push(newReceiptUrl);
        }

        // Base Update Query
        const queryText = `
            UPDATE student_fees 
            SET month = $1, year = $2, amount = $3, status = $4, paid_date = $5 ${receiptUrlClause}
            WHERE id = $6 RETURNING *
        `;

        // Adjust values array for dynamic Receipt URL Param
        // If file exists: values has 7 elements. $6 is feeId. $7 is Url.
        // If file NO: values has 6 elements. $6 is feeId. Clause is empty.

        // CORRECTION: values array needs to match query order.
        // $1..$5 are fixed. 
        // If receipt: ... receipt_url = $6 ... WHERE id = $7
        // If no receipt: ... WHERE id = $6

        let finalQuery = "";
        let finalValues = [];

        if (req.file) {
            finalQuery = `UPDATE student_fees SET month=$1, year=$2, amount=$3, status=$4, paid_date=$5, receipt_url=$6 WHERE id=$7 RETURNING *`;
            finalValues = [month, year, amount, status, date || null, `/uploads/${req.file.filename}`, feeId];
        } else {
            finalQuery = `UPDATE student_fees SET month=$1, year=$2, amount=$3, status=$4, paid_date=$5 WHERE id=$6 RETURNING *`;
            finalValues = [month, year, amount, status, date || null, feeId];
        }

        const result = await query(finalQuery, finalValues);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Fee record not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Error updating fee:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 4. DELETE: Fee
router.delete('/:id/fees/:feeId', async (req, res) => {
    try {
        const { feeId } = req.params;
        const result = await query('DELETE FROM student_fees WHERE id = $1 RETURNING *', [feeId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Fee record not found' });
        }

        res.json({ message: 'Fee payment cancelled successfully' });
    } catch (err) {
        console.error("Error deleting fee:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 5. PUT: Update Monthly Fee
router.put('/:id/monthly-fee', async (req, res) => {
    try {
        const { id } = req.params;
        const { monthlyFee } = req.body;

        const result = await query(
            'UPDATE students SET monthly_fee = $1 WHERE id = $2 RETURNING monthly_fee',
            [monthlyFee, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Student not found' });
        }

        res.json({ message: 'Monthly fee updated', monthlyFee: result.rows[0].monthly_fee });
    } catch (err) {
        console.error("Error updating monthly fee:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
