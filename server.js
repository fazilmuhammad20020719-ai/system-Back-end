import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { query } from './db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Routes
// Dashboard API
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const studentCount = await query('SELECT count(*) FROM students');
        const programCount = await query('SELECT count(*) FROM programs');
        // Real calculations for "Active" percentages (proxy for attendance/engagement)
        const activeStudentCount = await query("SELECT count(*) FROM students WHERE status = 'Active'");
        const activeTeacherCount = await query("SELECT count(*) FROM teachers WHERE status = 'Active'");

        const totalStudents = parseInt(studentCount.rows[0].count);
        const totalTeachers = parseInt(teacherCount.rows[0].count);
        const activeStudents = parseInt(activeStudentCount.rows[0].count);
        const activeTeachers = parseInt(activeTeacherCount.rows[0].count);

        const studentPercentage = totalStudents > 0 ? Math.round((activeStudents / totalStudents) * 100) + "%" : "0%";
        const teacherPercentage = totalTeachers > 0 ? Math.round((activeTeachers / totalTeachers) * 100) + "%" : "0%";

        res.json({
            students: totalStudents,
            teachers: totalTeachers,
            programs: parseInt(programCount.rows[0].count),
            documents: parseInt(docCount.rows[0].count),
            studentAttendance: studentPercentage,
            teacherAttendance: teacherPercentage,
            activeStudents,
            activeTeachers
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/dashboard/activities', async (req, res) => {
    try {
        const result = await query('SELECT * FROM activities ORDER BY created_at DESC LIMIT 5');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Search API
app.get('/api/search', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.json({ students: [], teachers: [], documents: [] });

    try {
        const students = await query('SELECT * FROM students WHERE name ILIKE $1 OR id ILIKE $1 LIMIT 5', [`%${q}%`]);
        const teachers = await query('SELECT * FROM teachers WHERE name ILIKE $1 OR emp_id ILIKE $1 LIMIT 5', [`%${q}%`]);
        const documents = await query('SELECT * FROM documents WHERE name ILIKE $1 LIMIT 5', [`%${q}%`]);

        res.json({
            students: students.rows,
            teachers: teachers.rows,
            documents: documents.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    // Simple validation
    if (!username || !password) {
        return res.status(400).json({ message: 'Please enter all fields' });
    }

    try {
        const result = await query('SELECT * FROM users WHERE username = $1', [username]);

        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        const user = result.rows[0];

        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, {
            expiresIn: '1h'
        });

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Add Student API
app.post('/api/students', async (req, res) => {
    const {
        indexNumber, firstName, lastName, program, session,
        guardianName, guardianPhone, phone
    } = req.body;

    // Basic Validation
    if (!indexNumber || !firstName) {
        return res.status(400).json({ message: 'Index number and name are required' });
    }

    const fullName = `${firstName} ${lastName}`.trim();

    try {
        // 1. Resolve Program ID (Simple mapping for now based on AddStudent dropdowns)
        let programId = 1; // Default
        const programMap = {
            'Al-Alim (Boys)': 'Al Alim',
            'Al-Alimah (Girls)': 'Al Alimah',
            'Hifzul Quran': 'Al Hafiz'
        };

        const targetProgramName = programMap[program] || program;

        // Try to find program in DB
        const progResult = await query('SELECT id FROM programs WHERE name ILIKE $1', [`%${targetProgramName}%`]);
        if (progResult.rows.length > 0) {
            programId = progResult.rows[0].id;
        }

        // 2. Insert Student
        // Schema: id, name, program_id, current_year, session_year, guardian_name, contact_number, status
        await query(
            `INSERT INTO students (id, name, program_id, current_year, session_year, guardian_name, contact_number)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO UPDATE SET 
             name=$2, program_id=$3, session_year=$5, guardian_name=$6, contact_number=$7`,
            [
                indexNumber,
                fullName,
                programId,
                'Year 1', // Default current_year as it's a new admission
                session,
                guardianName,
                phone || guardianPhone // Use student phone, fallback to guardian
            ]
        );

        // 3. Log Activity
        const activityTitle = 'New Admission';
        const activityDesc = `${fullName} - ${program}`;
        await query(
            `INSERT INTO activities (title, description, icon_type) VALUES ($1, $2, 'UserPlus')`,
            [activityTitle, activityDesc]
        );

        res.status(201).json({ message: 'Student added and activity logged successfully' });

    } catch (err) {
        console.error("Error adding student:", err);
        res.status(500).json({ message: 'Server error while adding student' });
    }
});

// Test route
app.get('/', (req, res) => {
    res.send('API is running');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
