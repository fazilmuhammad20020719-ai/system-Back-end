import { query } from './db.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const seed = async () => {
    try {
        console.log('Running schema migration...');

        // Read and execute schema.sql to ensure tables exist
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        await query(schemaSql);
        console.log('Schema migration complete.');

        // Seed Admin User
        const password = 'Admin1234#';
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        const check = await query('SELECT * FROM users WHERE username = $1', ['admin']);
        if (check.rows.length === 0) {
            console.log('Creating admin user...');
            await query('INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)', ['admin', hash, 'admin']);
        }

        /*
        // Seed Programs
        const progCheck = await query('SELECT count(*) FROM programs');
        if (parseInt(progCheck.rows[0].count) === 0) {
            console.log('Seeding programs...');
            await query(`
                INSERT INTO programs (name, head_of_program, type, color_theme) VALUES
                ('Al Alim', 'Mr. Ahmed Kabeer', 'Boys', 'bg-blue-100 text-blue-600'),
                ('Al Alimah', 'Ms. Fatima Rihana', 'Girls', 'bg-pink-100 text-pink-600'),
                ('Al Hafiz', 'Sheikh Abdullah', 'Hifz', 'bg-emerald-100 text-emerald-600'),
                ('O/L', 'U.L.M Hassen', 'General', 'bg-orange-100 text-orange-600'),
                ('A/L', 'Head Master', 'General', 'bg-indigo-100 text-indigo-600')
            `);
        }

        // Seed Students
        const stuCheck = await query('SELECT count(*) FROM students');
        if (parseInt(stuCheck.rows[0].count) === 0) {
            console.log('Seeding students...');
            // Need correct program IDs, assuming 1-5 based on insertion order
            await query(`
                INSERT INTO students (id, name, program_id, current_year, session_year, guardian_name, contact_number) VALUES
                ('2025001', 'Muhammad Ahmed', 3, 'Grade 1', '2025', 'Ali Ahmed', '077 123 4567'),
                ('2025002', 'Omar Farooq', 3, 'Grade 1', '2025', 'Farooq Khan', '071 222 3333'),
                ('2025010', 'Yusuf Islam', 1, 'Year 1', '2025', 'Cat Stevens', '077 444 5555'),
                ('2025020', 'Ayesha Siddiqa', 2, 'Grade 1', '2025', 'Abu Bakr', '077 999 8888')
            `);
        }

        // Seed Teachers
        const teachCheck = await query('SELECT count(*) FROM teachers');
        if (parseInt(teachCheck.rows[0].count) === 0) {
            console.log('Seeding teachers...');
            await query(`
                INSERT INTO teachers (emp_id, name, program_id, subject, role, email, phone) VALUES
                ('EMP-001', 'Dr. Sarah Wilson', 3, 'Tajweed Rules', 'Head of Dept', 'sarah@college.edu', '+94 77 123 4567'),
                ('EMP-002', 'Mr. Ahmed Kabeer', 1, 'Arabic Grammar', 'Senior Lecturer', 'ahmed@college.edu', '+94 77 987 6543'),
                ('EMP-003', 'Ms. Fatima Rihana', 2, 'English Literature', 'Visiting Lecturer', 'fatima@college.edu', '+94 71 555 0123')
            `);
        }

        // Seed Documents
        const docCheck = await query('SELECT count(*) FROM documents');
        if (parseInt(docCheck.rows[0].count) === 0) {
            console.log('Seeding documents...');
            await query(`
                INSERT INTO documents (id, name, type, category) VALUES
                ('DOC-001', 'Student Handbook 2025.pdf', 'PDF', 'Policy'),
                ('DOC-002', 'Exam Calendar Term 1.xlsx', 'Excel', 'Schedule'),
                ('DOC-003', 'Staff Directory.csv', 'CSV', 'HR')
            `);
        }

        // Seed Activities
        const actCheck = await query('SELECT count(*) FROM activities');
        if (parseInt(actCheck.rows[0].count) === 0) {
            console.log('Seeding activities...');
            await query(`
                INSERT INTO activities (title, description, icon_type) VALUES
                ('New Admission', 'agdf - Qiraat Course Grade 1', 'UserPlus'),
                ('Document Uploaded', 'File Birth Certificate (Student File)', 'FileText'),
                ('Document Uploaded', 'File ID Card/NIC (Student File)', 'Upload')
            `);
        }

        // Seed Alerts
        const alertCheck = await query('SELECT count(*) FROM alerts');
        if (parseInt(alertCheck.rows[0].count) === 0) {
            console.log('Seeding alerts...');
            // Calculate dates relative to now for demo
            const today = new Date();
            const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
            const dayAfter = new Date(today); dayAfter.setDate(today.getDate() + 2);

            await query(`
                INSERT INTO alerts (title, message, icon_type, due_date, color_theme) VALUES
                ('Salary Payment Due', 'Teachers Salary for October Month', 'CreditCard', $1, 'red'),
                ('Electricity Bill', 'Last date to pay monthly bill', 'AlertTriangle', $2, 'orange'),
                ('Student Fees Collection', '10 Students pending fees deadline', 'Bell', $3, 'blue'),
                ('Staff Meeting', 'Monthly preparation meeting', 'Calendar', $3, 'gray')
            `, [today, tomorrow, dayAfter]);
        }
        */

        console.log('Seeding complete.');
        process.exit(0);
    } catch (err) {
        console.error('Seeding failed:', err);
        process.exit(1);
    }
};

seed();
