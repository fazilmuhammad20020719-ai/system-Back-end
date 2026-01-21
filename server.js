const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const runMigrations = require('./migrations');
const { query } = require('./db'); // Import query if needed for utility routes

// Import Routes
const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const programRoutes = require('./routes/programRoutes');
const subjectRoutes = require('./routes/subjectRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');

const app = express();
const port = process.env.PORT || 5000;

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// --- STATIC FILES ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
app.use('/uploads', express.static('uploads'));

// --- DB MIGRATIONS ---
runMigrations();

// --- ROUTES ---
app.use('/api', authRoutes); // /api/login
app.use('/api/students', studentRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/programs', programRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/calendar', require('./routes/calendarRoutes'));
app.use('/api/schedules', scheduleRoutes);

// --- UTILITY: Clear All Teacher Assigned Programs ---
app.get('/api/utility/clear-teacher-programs', async (req, res) => {
    try {
        const result = await query('UPDATE teachers SET assigned_programs = NULL RETURNING id, name');
        res.json({
            message: 'Cleared assigned_programs for all teachers',
            count: result.rowCount,
            teachers: result.rows.map(t => t.name)
        });
    } catch (err) {
        console.error("Error clearing programs:", err);
        res.status(500).json({ message: 'Error: ' + err.message });
    }
});

// --- START SERVER ---
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});