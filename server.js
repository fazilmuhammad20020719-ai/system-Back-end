const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// ─── In-Memory Error Log Store ───────────────────────────────────────────────
const MAX_LOGS = 500;
const errorLogs = [];

function pushLog(type, message, stack, route) {
    errorLogs.unshift({
        id: Date.now() + Math.random().toString(36).slice(2, 7),
        timestamp: new Date().toISOString(),
        type,      // 'server' | 'database' | 'system'
        message: String(message || ''),
        stack: stack || null,
        route: route || null,
    });
    if (errorLogs.length > MAX_LOGS) errorLogs.splice(MAX_LOGS);
}

// Intercept console.error globally
const _origError = console.error.bind(console);
console.error = (...args) => {
    _origError(...args);
    const msg = args.map(a => (a instanceof Error ? a.message : String(a))).join(' ');
    const err = args.find(a => a instanceof Error);
    const isDb = msg.toLowerCase().includes('db') ||
        msg.toLowerCase().includes('database') ||
        msg.toLowerCase().includes('query') ||
        msg.toLowerCase().includes('sql') ||
        msg.toLowerCase().includes('relation') ||
        msg.toLowerCase().includes('column') ||
        msg.toLowerCase().includes('postgres') ||
        msg.toLowerCase().includes('pg');
    pushLog(isDb ? 'database' : 'server', msg, err?.stack || null, process._currentRoute || null);
};

// Intercept unhandled rejections / exceptions
process.on('uncaughtException', (err) => {
    pushLog('system', err.message, err.stack, null);
    _origError('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : null;
    pushLog('system', msg, stack, null);
    _origError('Unhandled Rejection:', reason);
});

module.exports.errorLogs = errorLogs;
module.exports.pushLog = pushLog;

// ─── System Pause / Maintenance Mode ─────────────────────────────────────────
let systemPaused = false;
module.exports.getSystemPaused = () => systemPaused;
module.exports.setSystemPaused = (val) => { systemPaused = val; };

const runMigrations = require('./migrations');
const { query, pool } = require('./db'); // Import query & pool for utility routes

// Hook DB pool-level errors into the log store
pool.on('error', (err) => {
    pushLog('database', err.message, err.stack, null);
    _origError('DB Pool Error:', err);
});

// Import Routes
const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const programRoutes = require('./routes/programRoutes');
const subjectRoutes = require('./routes/subjectRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const examRoutes = require('./routes/examRoutes');


const app = express();
const port = process.env.PORT || 5000;

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// Track current request URL for error labeling
app.use((req, _res, next) => { process._currentRoute = `${req.method} ${req.path}`; next(); });

// ─── Maintenance Mode Middleware ──────────────────────────────────────────────
// Blocks all non-controller routes when system is paused
app.use((req, res, next) => {
    if (module.exports.getSystemPaused() && !req.path.startsWith('/api/controller')) {
        return res.status(503).json({
            paused: true,
            message: 'System is paused. Please wait for the administrator to resume operations.',
        });
    }
    next();
});

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
app.use('/api/students/:id/notes', require('./routes/studentNotesRoutes'));
app.use('/api/teachers', teacherRoutes);
app.use('/api/programs', programRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/calendar', require('./routes/calendarRoutes'));
app.use('/api/schedules', scheduleRoutes);
app.use('/api/slots', require('./routes/slotRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes')); // Dynamic Dashboard
app.use('/api/exams', examRoutes);
app.use('/api/activities', require('./routes/activityRoutes'));
app.use('/api/controller', require('./routes/controllerRoutes'));

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

// --- UTILITY: Fix Missing Columns (Temporary) ---
app.get('/api/fix-missing-columns', async (req, res) => {
    try {
        await query("ALTER TABLE exams ADD COLUMN IF NOT EXISTS slot_id INTEGER REFERENCES examination_slots(id) ON DELETE CASCADE;");
        await query("ALTER TABLE exams ADD COLUMN IF NOT EXISTS supervisor_id INTEGER REFERENCES teachers(id);");
        res.json({ message: "Successfully added slot_id and supervisor_id columns to exams table." });
    } catch (err) {
        console.error("Error fixing columns:", err);
        res.status(500).json({ error: err.message });
    }
});

// --- START SERVER ---
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});