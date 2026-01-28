const express = require('express');
const router = express.Router();
const db = require('../db');

// 1. GET ALL EXAMS
router.get('/', async (req, res) => {
    try {
        const result = await db.query(`
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
            ORDER BY e.exam_date DESC, e.start_time ASC
        `);

        const exams = result.rows.map(exam => {
            try {
                const now = new Date();
                // Safe Date Parsing
                if (!exam.exam_date) return exam;

                const dateObj = new Date(exam.exam_date);
                if (isNaN(dateObj.getTime())) return exam; // Invalid Date

                const dateStr = dateObj.toISOString().split('T')[0];

                // Ensure times are valid strings or default safely
                const endTimeVal = exam.end_time || '23:59:00';
                const startTimeVal = exam.start_time || '00:00:00';

                const endDateTimeStr = `${dateStr}T${endTimeVal}`;
                const startDateTimeStr = `${dateStr}T${startTimeVal}`;

                const examEnd = new Date(endDateTimeStr);
                const examStart = new Date(startDateTimeStr);

                let dynamicStatus = exam.status;

                // Logic: If status is not Cancelled, check time
                if (dynamicStatus !== 'Cancelled') {
                    if (now > examEnd) {
                        dynamicStatus = 'Completed';
                    } else if (now >= examStart && now <= examEnd) {
                        dynamicStatus = 'Ongoing';
                    } else {
                        // implied upcoming if not started
                        if (dynamicStatus !== 'Upcoming' && now < examStart) {
                            dynamicStatus = 'Upcoming';
                        }
                    }
                }

                return { ...exam, status: dynamicStatus };
            } catch (e) {
                // If anything fails in calculation, just return the exam as is
                return exam;
            }
        });

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
            supervisorId // New field
        } = req.body;

        // Resolve IDs
        const pId = programId || program_id;
        const sId = subjectId || subject_id;
        const stIds = studentIds || student_ids;

        // Extract Schedule
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

        // Validate
        if (!examDate) {
            throw new Error("Exam date is required");
        }

        // A. Insert Exam
        const examRes = await client.query(
            `INSERT INTO exams (title, program_id, subject_id, exam_date, start_time, end_time, venue, total_marks, supervisor_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [title, pId, sId, examDate, startTime, endTime, place, 100, supervisorId || null]
        );
        const examId = examRes.rows[0].id;

        // B. Add Students
        if (stIds && stIds.length > 0) {
            for (const studId of stIds) {
                await client.query(
                    `INSERT INTO exam_results (exam_id, student_id, status) VALUES ($1, $2, 'Present')
                     ON CONFLICT (exam_id, student_id) DO NOTHING`,
                    [examId, studId]
                );
            }
        }

        await client.query('COMMIT');
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
            title, programId, subjectId,
            parts, studentIds, supervisorId
        } = req.body;

        // Extract Schedule
        let examDate, startTime, endTime, place;
        if (parts && Array.isArray(parts) && parts.length > 0) {
            const mainPart = parts[0];
            examDate = mainPart.date;
            startTime = mainPart.startTime;
            endTime = mainPart.endTime;
            place = mainPart.venue;
        }

        // 1. Update Exam Details
        await client.query(
            `UPDATE exams 
             SET title = $1, program_id = $2, subject_id = $3, 
                 exam_date = $4, start_time = $5, end_time = $6, venue = $7, supervisor_id = $8
             WHERE id = $9`,
            [title, programId, subjectId, examDate, startTime, endTime, place, supervisorId, id]
        );

        // 2. Update Students (Optional: Replace or Add new? simpliest is Add new, ignore existing)
        // Note: Removing students who are already graded is risky. We will only ADD new selected students.
        if (studentIds && studentIds.length > 0) {
            for (const studId of studentIds) {
                await client.query(
                    `INSERT INTO exam_results (exam_id, student_id, status) VALUES ($1, $2, 'Present')
                     ON CONFLICT (exam_id, student_id) DO NOTHING`,
                    [id, studId]
                );
            }
        }

        await client.query('COMMIT');
        res.json({ message: "Exam updated successfully" });

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
        if (status) {
            await db.query(`UPDATE exams SET status = $1 WHERE id = $2`, [status, req.params.id]);
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
