import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { query } from './db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();

console.log("Server script started");
const app = express();
const PORT = process.env.PORT || 5000;
console.log("Environment PORT:", process.env.PORT);

app.use(cors());
app.use(express.json());

// Routes

// --- DASHBOARD API ---
app.get('/api/dashboard', async (req, res) => {
    try {
        const studentCount = await query('SELECT count(*) FROM students');
        const teacherCount = await query('SELECT count(*) FROM teachers');
        const programCount = await query('SELECT count(*) FROM programs');
        const activeStudentCount = await query("SELECT count(*) FROM students WHERE status = 'Active'");
        const activeTeacherCount = await query("SELECT count(*) FROM teachers WHERE status = 'Active'");
        const docCount = await query('SELECT count(*) FROM documents');

        const totalStudents = parseInt(studentCount.rows[0].count);
        const totalTeachers = parseInt(teacherCount.rows[0].count);
        const activeStudents = parseInt(activeStudentCount.rows[0].count);
        const activeTeachers = parseInt(activeTeacherCount.rows[0].count);

        const studentPercentage = totalStudents > 0 ? Math.round((activeStudents / totalStudents) * 100) + "%" : "0%";
        const teacherPercentage = totalTeachers > 0 ? Math.round((activeTeachers / totalTeachers) * 100) + "%" : "0%";

        const stats = {
            students: totalStudents,
            teachers: totalTeachers,
            programs: parseInt(programCount.rows[0].count),
            documents: parseInt(docCount.rows[0].count || 0),
            studentAttendance: studentPercentage,
            teacherAttendance: teacherPercentage,
            activeStudents,
            activeTeachers
        };

        const activitiesResult = await query('SELECT * FROM activities ORDER BY created_at DESC LIMIT 5');

        const alertsResult = await query('SELECT * FROM alerts ORDER BY due_date ASC LIMIT 5');
        const processAlerts = alertsResult.rows.map(alert => {
            const due = new Date(alert.due_date);
            const today = new Date();
            due.setHours(0, 0, 0, 0);
            today.setHours(0, 0, 0, 0);
            const diffTime = due - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return {
                ...alert,
                daysFromNow: diffDays,
                date: due.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
            };
        });

        res.json({
            stats,
            activities: activitiesResult.rows,
            alerts: processAlerts
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// --- STUDENTS API ---
app.get('/api/students', async (req, res) => {
    try {
        const result = await query(`
            SELECT 
                s.id, 
                s.name, 
                p.name as program,
                s.session_year as session,
                s.current_year as year,
                s.guardian_name as guardian,
                s.contact_number as contact,
                s.status 
            FROM students s
            LEFT JOIN programs p ON s.program_id = p.id
            ORDER BY s.id DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching students:", err);
        res.status(500).send("Server Error");
    }
});

app.get('/api/students/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await query(`
            SELECT s.*, p.name as program_name 
            FROM students s
            LEFT JOIN programs p ON s.program_id = p.id
            WHERE s.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Student not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Error fetching student:", err);
        res.status(500).send("Server Error");
    }
});

app.post('/api/students', async (req, res) => {
    const {
        indexNumber, firstName, lastName, program, session,
        guardianName, guardianPhone, phone
    } = req.body;

    if (!indexNumber || !firstName) {
        return res.status(400).json({ message: 'Index number and name are required' });
    }

    const fullName = `${firstName} ${lastName}`.trim();

    try {
        let programId = 1;
        const progResult = await query('SELECT id FROM programs WHERE name ILIKE $1', [`%${program}%`]);
        if (progResult.rows.length > 0) {
            programId = progResult.rows[0].id;
        }

        await query(
            `INSERT INTO students (id, name, program_id, current_year, session_year, guardian_name, contact_number)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO UPDATE SET 
             name=$2, program_id=$3, session_year=$5, guardian_name=$6, contact_number=$7`,
            [indexNumber, fullName, programId, 'Year 1', session, guardianName, phone || guardianPhone]
        );

        await query(
            `INSERT INTO activities (title, description, icon_type) VALUES ($1, $2, 'UserPlus')`,
            ['New Admission', `${fullName} - ${program}`]
        );

        res.status(201).json({ message: 'Student added successfully' });
    } catch (err) {
        console.error("Error adding student:", err);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- TEACHERS API ---
app.get('/api/teachers', async (req, res) => {
    try {
        const result = await query(`
            SELECT 
                t.*,
                p.name as program_name
            FROM teachers t
            LEFT JOIN programs p ON t.program_id = p.id
            ORDER BY t.id DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching teachers:", err);
        res.status(500).send("Server Error");
    }
});

app.post('/api/teachers', async (req, res) => {
    const {
        empId, name, program, subject, role, email, phone,
        address, nic, dob, joiningDate, designation, qualification
    } = req.body;

    try {
        let programId = null;
        if (program) {
            const progResult = await query('SELECT id FROM programs WHERE name ILIKE $1', [`%${program}%`]);
            if (progResult.rows.length > 0) programId = progResult.rows[0].id;
        }

        await query(
            `INSERT INTO teachers (
                emp_id, name, program_id, subject, role, email, phone,
                address, nic, dob, joining_date, designation, qualification
            )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [
                empId, name, programId, subject, role, email, phone,
                address, nic, dob, joiningDate, designation, qualification
            ]
        );

        await query(
            `INSERT INTO activities (title, description, icon_type) VALUES ($1, $2, 'UserPlus')`,
            ['New Teacher', `${name} joined as ${role}`]
        );

        res.status(201).json({ message: "Teacher added" });
    } catch (err) {
        console.error("Error adding teacher:", err);
        res.status(500).send("Server Error");
    }
});

// --- ATTENDANCE API ---
app.get('/api/attendance', async (req, res) => {
    const { date, program, studentId } = req.query;
    try {
        let queryStr = `
            SELECT a.*, s.name as student_name, s.id as student_id
            FROM attendance a
            JOIN students s ON a.student_id = s.id
            LEFT JOIN programs p ON s.program_id = p.id
            WHERE 1=1
         `;
        const params = [];
        let paramCount = 1;

        if (date) {
            queryStr += ` AND a.date = $${paramCount}`;
            params.push(date);
            paramCount++;
        }
        if (program) {
            queryStr += ` AND p.name ILIKE $${paramCount}`;
            params.push(`%${program}%`);
            paramCount++;
        }
        if (studentId) {
            queryStr += ` AND s.id = $${paramCount}`;
            params.push(studentId);
            paramCount++;
        }

        const result = await query(queryStr, params);
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching attendance:", err);
        res.status(500).send("Server Error");
    }
});

app.post('/api/attendance', async (req, res) => {
    const { studentId, date, status, remarks } = req.body;
    try {
        await query(
            `INSERT INTO attendance (student_id, date, status, remarks)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (student_id, date) DO UPDATE SET status=$3, remarks=$4`,
            [studentId, date, status, remarks]
        );
        res.json({ message: "Attendance marked" });
    } catch (err) {
        console.error("Error marking attendance:", err);
        res.status(500).send("Server Error");
    }
});

// --- CALENDAR / SCHEDULE API ---
app.get('/api/calendar/events', async (req, res) => {
    try {
        const result = await query('SELECT * FROM calendar_events ORDER BY date ASC');
        const events = result.rows.map(event => {
            const d = new Date(event.date);
            return {
                id: event.id,
                day: d.getDate(),
                month: d.getMonth(),
                year: d.getFullYear(),
                title: event.title,
                fullText: event.description,
                type: event.type,
                date: event.date
            };
        });
        res.json(events);
    } catch (err) {
        console.error("Error fetching events:", err);
        res.json([]);
    }
});

app.post('/api/calendar/events', async (req, res) => {
    const { title, description, date, type } = req.body;
    try {
        const result = await query(
            'INSERT INTO calendar_events (title, description, date, type) VALUES ($1, $2, $3, $4) RETURNING *',
            [title, description, date, type]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error("Error creating event:", err);
        res.status(500).send("Server Error");
    }
});

app.delete('/api/calendar/events/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await query('DELETE FROM calendar_events WHERE id = $1', [id]);
        res.json({ message: "Event deleted" });
    } catch (err) {
        console.error("Error deleting event:", err);
        res.status(500).send("Server Error");
    }
});

// --- SCHEDULE API (Timetable) ---
app.get('/api/schedule', async (req, res) => {
    try {
        const result = await query(`
            SELECT 
                sch.*, 
                p.name as program_name,
                s.name as subject_name,
                t.name as teacher_name
            FROM schedule sch
            LEFT JOIN programs p ON sch.program_id = p.id
            LEFT JOIN subjects s ON sch.subject_id = s.id
            LEFT JOIN teachers t ON sch.teacher_id = t.id
        `);
        res.json(result.rows);
    } catch (err) {
        console.error("Fetch schedule error:", err);
        res.json([]);
    }
});

app.post('/api/schedule', async (req, res) => {
    const { programId, subjectId, teacherId, day, startTime, endTime, room, grade } = req.body;
    try {
        await query(
            `INSERT INTO schedule (program_id, subject_id, teacher_id, day_of_week, start_time, end_time, room, grade_year)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [programId, subjectId, teacherId, day, startTime, endTime, room, grade]
        );
        res.status(201).json({ message: "Schedule added" });
    } catch (err) {
        console.error("Add schedule error", err);
        res.status(500).send("Server Error");
    }
});

app.delete('/api/schedule/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await query('DELETE FROM schedule WHERE id = $1', [id]);
        res.json({ message: "Schedule deleted" });
    } catch (err) {
        console.error("Delete schedule error:", err);
        res.status(500).send("Server Error");
    }
});

// --- SUBJECTS API ---
app.get('/api/subjects', async (req, res) => {
    try {
        const result = await query(`
            SELECT s.*, p.name as program 
            FROM subjects s
            LEFT JOIN programs p ON s.program_id = p.id
        `);
        res.json(result.rows);
    } catch (err) {
        console.error("Fetch subjects error:", err);
        res.status(500).send("Server Error");
    }
});

// --- DOCUMENTS API ---
app.get('/api/documents', async (req, res) => {
    try {
        const result = await query('SELECT * FROM documents ORDER BY upload_date DESC');
        res.json(result.rows);
    } catch (err) {
        console.error("Fetch docs error:", err);
        res.status(500).send("Server Error");
    }
});

app.post('/api/documents', async (req, res) => {
    const { name, type, category } = req.body;
    try {
        const id = 'DOC-' + Math.floor(Math.random() * 10000);
        await query(
            `INSERT INTO documents (id, name, type, category) VALUES ($1, $2, $3, $4)`,
            [id, name, type, category]
        );
        res.status(201).json({ message: "Document added" });
    } catch (err) {
        console.error("Add doc error:", err);
        res.status(500).send("Server Error");
    }
});

app.delete('/api/documents/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await query('DELETE FROM documents WHERE id = $1', [id]);
        res.json({ message: "Document deleted" });
    } catch (err) {
        console.error("Delete doc error:", err);
        res.status(500).send("Server Error");
    }
});

// --- PROGRAMS API (Dropdowns & Management) ---
app.get('/api/programs', async (req, res) => {
    try {
        const result = await query('SELECT * FROM programs ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

app.post('/api/programs', async (req, res) => {
    const { name, head, duration, fee, status } = req.body;
    try {
        const result = await query(
            `INSERT INTO programs (name, head_of_program, duration, fees, status) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING *`,
            [name, head, duration, fee, status]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error("Error adding program:", err);
        res.status(500).send("Server Error");
    }
});

// --- AUTH ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Enter fields' });

    try {
        const result = await query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) return res.status(401).json({ message: 'Invalid credentials' });

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- SEARCH ---
app.get('/api/search', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.json({ students: [], teachers: [], documents: [] });

    try {
        const students = await query('SELECT * FROM students WHERE name ILIKE $1 LIMIT 5', [`%${q}%`]);
        const teachers = await query('SELECT * FROM teachers WHERE name ILIKE $1 LIMIT 5', [`%${q}%`]);
        const documents = await query('SELECT * FROM documents WHERE name ILIKE $1 LIMIT 5', [`%${q}%`]);
        res.json({ students: students.rows, teachers: teachers.rows, documents: documents.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
