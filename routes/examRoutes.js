const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { logActivity } = require('../utils/activityLogger');

// Create upload directory if it doesn't exist
const uploadDir = path.join(__dirname, '../uploads/exam_papers');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure Multer for exam papers
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // e.g., exam_1_student_12_167888.pdf
        const ext = path.extname(file.originalname);
        const fileName = `exam_${req.params.id}_student_${req.params.studentId}_${Date.now()}${ext}`;
        cb(null, fileName);
    }
});
const upload = multer({ storage });

// 1. GET ALL EXAMS (With Filtering & Parts)
router.get('/', async (req, res) => {
    try {
        const { slotId } = req.query;
        let queryText = `
            SELECT 
                e.*, 
                p.name as program_name, 
                s.name as subject_name,
                t.name as supervisor_name,
                (SELECT COUNT(*) FROM exam_results er WHERE er.exam_id = e.id) as assigned_students,
                (SELECT COUNT(*) FROM exam_results er WHERE er.exam_id = e.id AND er.status = 'Present') as present_students,
                (SELECT COUNT(*) FROM exam_results er WHERE er.exam_id = e.id AND er.status = 'Absent') as absent_students
            FROM exams e
            LEFT JOIN programs p ON e.program_id = p.id
            LEFT JOIN subjects s ON e.subject_id = s.id
            LEFT JOIN teachers t ON e.supervisor_id = t.id
        `;

        const params = [];
        if (slotId) {
            queryText += ` WHERE e.slot_id = $1`;
            params.push(slotId);
        }

        queryText += ` ORDER BY e.exam_date DESC, e.start_time ASC`;

        const result = await db.query(queryText, params);

        // Fetch Parts for these exams
        // This could be optimized, but map implementation is safest for now
        const exams = await Promise.all(result.rows.map(async (exam) => {
            try {
                // Fetch Parts
                const partsRes = await db.query(`SELECT * FROM exam_parts WHERE exam_id = $1 ORDER BY exam_date DESC, start_time DESC`, [exam.id]);
                exam.parts = partsRes.rows.reverse(); // keep display order ASC, but pick last for status

                const now = new Date();
                if (!exam.exam_date) return exam;

                // Bug Fix 2: For multi-part exams, determine status from the LAST part's date/time,
                // not the first part (exam_date on main record). An exam is only "Completed"
                // when ALL parts are done.
                let statusDateStr, statusEndTime, statusStartTime;
                if (exam.parts && exam.parts.length > 0) {
                    // Last part (already ordered ASC, so last index = last part)
                    const lastPart = exam.parts[exam.parts.length - 1];
                    const firstPart = exam.parts[0];
                    const lastDateObj = new Date(lastPart.exam_date);
                    const firstDateObj = new Date(firstPart.exam_date);
                    if (isNaN(lastDateObj.getTime())) return exam;
                    // Bug Fix 1: Use local date components (not toISOString which converts to UTC)
                    // to avoid a timezone mismatch when building the comparison datetime.
                    const toLocalDateStr = (d) => {
                        const yr  = d.getFullYear();
                        const mo  = String(d.getMonth() + 1).padStart(2, '0');
                        const dy  = String(d.getDate()).padStart(2, '0');
                        return `${yr}-${mo}-${dy}`;
                    };
                    statusDateStr   = toLocalDateStr(lastDateObj);
                    statusEndTime   = lastPart.end_time   || '23:59:00';
                    statusStartTime = firstPart.start_time || '00:00:00';
                    // Use first part's date for the start comparison
                    const firstDateStr = toLocalDateStr(firstDateObj);
                    statusStartTime = `${firstDateStr}T${firstPart.start_time || '00:00:00'}`;
                    statusEndTime   = `${statusDateStr}T${statusEndTime}`;
                } else {
                    // Single exam (no parts row) — use main record
                    const dateObj = new Date(exam.exam_date);
                    if (isNaN(dateObj.getTime())) return exam;
                    const toLocalDateStr = (d) => {
                        const yr  = d.getFullYear();
                        const mo  = String(d.getMonth() + 1).padStart(2, '0');
                        const dy  = String(d.getDate()).padStart(2, '0');
                        return `${yr}-${mo}-${dy}`;
                    };
                    const dateStr = toLocalDateStr(dateObj);
                    statusStartTime = `${dateStr}T${exam.start_time || '00:00:00'}`;
                    statusEndTime   = `${dateStr}T${exam.end_time   || '23:59:00'}`;
                }

                const examStart = new Date(statusStartTime);
                const examEnd   = new Date(statusEndTime);

                let dynamicStatus = exam.status;

                // Logic: If status is not Cancelled, determine from current time
                if (dynamicStatus !== 'Cancelled') {
                    if (now > examEnd) {
                        dynamicStatus = 'Completed';
                    } else if (now >= examStart && now <= examEnd) {
                        dynamicStatus = 'Ongoing';
                    } else {
                        // Bug Fix 3: In this else branch, now < examStart is always true.
                        // Unconditionally set Upcoming — the old guard was incorrect.
                        dynamicStatus = 'Upcoming';
                    }
                }

                return { ...exam, status: dynamicStatus };
            } catch (e) {
                return exam;
            }
        }));

        res.json(exams);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

// 2. CREATE EXAM (Simple & Direct)
router.post('/', async (req, res) => {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // Handle both camelCase (from frontend) and snake_case (fallback)
        const {
            title,
            programId, program_id,
            subjectId, subject_id,
            parts,
            studentIds, student_ids,
            supervisorId,
            slotId, slot_id
        } = req.body;

        const pId = programId || program_id;
        const sId = subjectId || subject_id;
        const stIds = studentIds || student_ids;
        const slId = slotId || slot_id;

        // Extract Schedule from first part for the main record
        let examDate, startTime, endTime, place;

        if (parts && Array.isArray(parts) && parts.length > 0) {
            const mainPart = parts[0];
            examDate = mainPart.date;
            startTime = mainPart.startTime;
            endTime = mainPart.endTime;
            place = mainPart.venue;
        } else {
            examDate = req.body.exam_date;
            startTime = req.body.start_time;
            endTime = req.body.end_time;
            place = req.body.venue;
        }

        if (!examDate) throw new Error("Exam date is required");

        // A. Insert Main Exam Record
        const examRes = await client.query(
            `INSERT INTO exams (title, program_id, subject_id, exam_date, start_time, end_time, venue, total_marks, supervisor_id, slot_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
            [title, pId, sId, examDate, startTime, endTime, place, 100, supervisorId || null, slId || null]
        );
        const examId = examRes.rows[0].id;

        // B. Insert Parts (if any)
        if (parts && Array.isArray(parts)) {
            for (const part of parts) {
                await client.query(
                    `INSERT INTO exam_parts (exam_id, name, exam_date, start_time, end_time, venue)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [examId, part.name, part.date, part.startTime, part.endTime, part.venue]
                );
            }
        }

        // C. Add Students
        if (stIds && stIds.length > 0) {
            for (const studId of stIds) {
                await client.query(
                    `INSERT INTO exam_results (exam_id, student_id, status) VALUES ($1, $2, NULL)
                     ON CONFLICT (exam_id, student_id) DO NOTHING`,
                    [examId, studId]
                );
            }
        }

        await client.query('COMMIT');

        // Log exam creation
        await logActivity(
            `New exam timetable created`,
            `Exam "${title}" was created and scheduled in the system.`,
            'Calendar',
            pId || null
        );

        res.json({ message: "Exam created successfully", examId });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error creating exam:", err);
        res.status(500).json({ error: "Server error", details: err.message });
    } finally {
        client.release();
    }
});

// 3. EDIT EXAM
router.put('/:id', async (req, res) => {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const { id } = req.params;
        const {
            title, programId, subjectId, grade, examType,
            parts, studentIds, supervisorId
        } = req.body;

        // Extract Schedule from first part for the main exam record
        let examDate, startTime, endTime, place;
        if (parts && Array.isArray(parts) && parts.length > 0) {
            const mainPart = parts[0];
            examDate = mainPart.date;
            startTime = mainPart.startTime;
            endTime = mainPart.endTime;
            place = mainPart.venue;
        }

        // 1. Update Main Exam Record (including grade and exam_type)
        await client.query(
            `UPDATE exams 
             SET title = $1, program_id = $2, subject_id = $3, 
                 exam_date = $4, start_time = $5, end_time = $6, venue = $7, supervisor_id = $8,
                 grade = $9, exam_type = $10
             WHERE id = $11`,
            [title, programId, subjectId, examDate, startTime, endTime, place, supervisorId, grade || null, examType || null, id]
        );

        // 2. Sync Exam Parts — delete old parts and re-insert updated ones
        await client.query(`DELETE FROM exam_parts WHERE exam_id = $1`, [id]);
        if (parts && Array.isArray(parts)) {
            for (const part of parts) {
                await client.query(
                    `INSERT INTO exam_parts (exam_id, name, exam_date, start_time, end_time, venue)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [id, part.name, part.date, part.startTime, part.endTime, part.venue]
                );
            }
        }

        // 3. Update Students:
        //    a) Remove any UNGRADED students that are no longer in the updated selection
        //    b) Add newly selected students
        if (studentIds && Array.isArray(studentIds)) {
            // Remove un-graded students that were de-selected
            if (studentIds.length > 0) {
                await client.query(
                    `DELETE FROM exam_results
                     WHERE exam_id = $1
                       AND student_id != ALL($2::int[])
                       AND marks_obtained IS NULL
                       AND grade IS NULL`,
                    [id, studentIds]
                );
            } else {
                // No students selected at all — remove all ungraded assignments
                await client.query(
                    `DELETE FROM exam_results
                     WHERE exam_id = $1 AND marks_obtained IS NULL AND grade IS NULL`,
                    [id]
                );
            }

            // Add newly selected students (skip existing ones)
            for (const studId of studentIds) {
                await client.query(
                    `INSERT INTO exam_results (exam_id, student_id, status) VALUES ($1, $2, NULL)
                     ON CONFLICT (exam_id, student_id) DO NOTHING`,
                    [id, studId]
                );
            }
        }

        await client.query('COMMIT');

        // Return updated exam data so the frontend can immediately reflect changes
        const updatedExam = await db.query(`
            SELECT e.*, p.name as program_name, s.name as subject_name, t.name as supervisor_name
            FROM exams e
            LEFT JOIN programs p ON e.program_id = p.id
            LEFT JOIN subjects s ON e.subject_id = s.id
            LEFT JOIN teachers t ON e.supervisor_id = t.id
            WHERE e.id = $1
        `, [id]);

        res.json({ message: "Exam updated successfully", exam: updatedExam.rows[0] });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error updating exam:", err);
        res.status(500).json({ error: "Server error" });
    } finally {
        client.release();
    }
});


// 4. GET EXAM DETAILS
router.get('/:id/details', async (req, res) => {
    try {
        const { id } = req.params;
        const examResult = await db.query(`
            SELECT e.*, p.name as program_name, s.name as subject_name, t.name as supervisor_name
            FROM exams e
            LEFT JOIN programs p ON e.program_id = p.id
            LEFT JOIN subjects s ON e.subject_id = s.id
            LEFT JOIN teachers t ON e.supervisor_id = t.id
            WHERE e.id = $1
        `, [id]);

        if (examResult.rows.length === 0) return res.status(404).json({ error: "Exam not found" });

        const studentsResult = await db.query(`
            SELECT st.id, st.name, st.reg_no, er.marks_obtained, er.grade, er.status, er.remarks
            FROM exam_results er
            JOIN students st ON er.student_id = st.id
            WHERE er.exam_id = $1
            ORDER BY st.name ASC
        `, [id]);

        res.json({ exam: examResult.rows[0], students: studentsResult.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

// GET EXAM ATTENDANCE
router.get('/:id/attendance', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query(
            'SELECT student_id, status FROM exam_results WHERE exam_id = $1',
            [id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching exam attendance:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// UPDATE EXAM ATTENDANCE (Single)
router.post('/attendance', async (req, res) => {
    try {
        const { examId, studentId, status } = req.body;
        await db.query(
            `UPDATE exam_results SET status = $1 WHERE exam_id = $2 AND student_id = $3`,
            [status, examId, studentId]
        );
        res.json({ message: "Attendance updated" });
    } catch (err) {
        console.error("Error saving exam attendance:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// UPDATE EXAM ATTENDANCE (Bulk)
router.post('/:id/attendance/bulk', async (req, res) => {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const { id } = req.params;
        const { attendanceData } = req.body; // { studentId: status }
        
        for (const [studentId, status] of Object.entries(attendanceData)) {
            await client.query(
                `UPDATE exam_results 
                 SET status = CASE 
                     WHEN $1 = 'Absent' THEN 'Absent'
                     WHEN marks_obtained IS NOT NULL THEN (CASE WHEN CAST(marks_obtained AS INTEGER) >= 50 THEN 'Pass' ELSE 'Fail' END)
                     ELSE $1
                 END
                 WHERE exam_id = $2 AND student_id = $3`,
                [status, id, studentId]
            );
        }
        
        // Mark attendance as taken for this exam
        await client.query(`UPDATE exams SET attendance_taken = true WHERE id = $1`, [id]);
        
        await client.query('COMMIT');
        res.json({ message: "Bulk attendance updated" });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error saving bulk exam attendance:", err);
        res.status(500).json({ error: "Server error" });
    } finally {
        client.release();
    }
});

// GET ALL RESULTS FOR A SPECIFIC STUDENT
router.get('/student/:studentId/results', async (req, res) => {
    try {
        const { studentId } = req.params;
        const result = await db.query(`
            SELECT
                e.id as exam_id,
                e.title as exam_name,
                e.exam_date,
                e.total_marks,
                e.slot_id,
                sl.name as slot_name,
                s.name as subject_name,
                p.name as program_name,
                er.marks_obtained,
                er.grade,
                er.status,
                er.remarks,
                er.paper_url
            FROM exam_results er
            JOIN exams e ON er.exam_id = e.id
            LEFT JOIN subjects s ON e.subject_id = s.id
            LEFT JOIN programs p ON e.program_id = p.id
            LEFT JOIN examination_slots sl ON e.slot_id = sl.id
            WHERE er.student_id = $1
            ORDER BY sl.name ASC, e.exam_date DESC
        `, [studentId]);
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching student results:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// GET EXAM RESULTS
router.get('/:id/results', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query(`
            SELECT 
                st.id as student_id, 
                st.name as student_name, 
                er.marks_obtained, 
                er.grade, 
                er.status, 
                er.remarks,
                er.paper_url
            FROM exam_results er
            JOIN students st ON er.student_id = st.id
            WHERE er.exam_id = $1
            ORDER BY st.name ASC
        `, [id]);
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching exam results:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// UPLOAD EXAM PAPER
router.post('/:id/results/:studentId/upload', upload.single('paper'), async (req, res) => {
    try {
        const { id, studentId } = req.params;
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        const fileUrl = `uploads/exam_papers/${req.file.filename}`;
        
        // Update database with URL
        await db.query(
            `UPDATE exam_results SET paper_url = $1 WHERE exam_id = $2 AND student_id = $3`,
            [fileUrl, id, studentId]
        );

        // Mark results as submitted for this exam
        await db.query(`UPDATE exams SET results_submitted = true WHERE id = $1`, [id]);

        res.json({ message: "File uploaded successfully", url: fileUrl });
    } catch (err) {
        console.error("Error uploading exam paper:", err);
        res.status(500).json({ error: "Upload failed" });
    }
});

// DELETE EXAM PAPER
router.delete('/:id/results/:studentId/upload', async (req, res) => {
    try {
        const { id, studentId } = req.params;
        
        // Find existing paper URL
        const result = await db.query(
            `SELECT paper_url FROM exam_results WHERE exam_id = $1 AND student_id = $2`,
            [id, studentId]
        );

        const currentUrl = result.rows[0]?.paper_url;
        if (currentUrl) {
            const filePath = path.join(__dirname, '..', currentUrl);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            
            // Clear URL in DB
            await db.query(
                `UPDATE exam_results SET paper_url = NULL WHERE exam_id = $1 AND student_id = $2`,
                [id, studentId]
            );
        }

        res.json({ message: "File deleted successfully" });
    } catch (err) {
        console.error("Error deleting exam paper:", err);
        res.status(500).json({ error: "Delete failed" });
    }
});

// 5. SAVE MARKS
router.post('/:id/results', async (req, res) => {
    const { results, status } = req.body;
    try {
        for (const r of results) {
            await db.query(
                `UPDATE exam_results SET marks_obtained = $1, grade = $2, status = $3, remarks = $4 
                 WHERE exam_id = $5 AND student_id = $6`,
                [r.marks_obtained, r.grade, r.status, r.remarks, req.params.id, r.id]
            );
        }

        // Mark results as submitted for this exam
        await db.query(`UPDATE exams SET results_submitted = true WHERE id = $1`, [req.params.id]);
        if (status) {
            await db.query(`UPDATE exams SET status = $1 WHERE id = $2`, [status, req.params.id]);
        }

        if (status === 'Published' || status === 'Completed') {
            const examInfo = await db.query('SELECT title, program_id FROM exams WHERE id = $1', [req.params.id]);
            const examTitle = examInfo.rows[0]?.title || `Exam #${req.params.id}`;
            const examProgId = examInfo.rows[0]?.program_id || null;
            await logActivity(
                `Exam results published`,
                `Marks and results for exam "${examTitle}" have been published.`,
                'FileText',
                examProgId
            );
        }

        res.json({ message: "Saved" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error saving results" });
    }
});

// 6. UPDATE STATUS (Cancel)
router.patch('/:id/status', async (req, res) => {
    try {
        await db.query('UPDATE exams SET status = $1 WHERE id = $2', [req.body.status, req.params.id]);
        res.json({ message: "Status updated" });
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

// 7. DELETE EXAM
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM exams WHERE id = $1', [req.params.id]);
        res.json({ message: "Deleted" });
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

module.exports = router;
