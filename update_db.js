import { query } from './db.js';

const createTables = async () => {
    try {
        console.log("Starting Database Update...");

        // 1. Calendar Events (if missing)
        await query(`
            CREATE TABLE IF NOT EXISTS calendar_events (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                date DATE,
                type VARCHAR(50)
            );
        `);
        console.log("Checked/Created 'calendar_events'");

        // 2. Subjects
        await query(`
            CREATE TABLE IF NOT EXISTS subjects (
                id SERIAL PRIMARY KEY,
                program_id INTEGER REFERENCES programs(id),
                name VARCHAR(100) NOT NULL
            );
        `);
        console.log("Checked/Created 'subjects'");

        // SEED SUBJECTS
        const subCount = await query('SELECT count(*) FROM subjects');
        if (parseInt(subCount.rows[0].count) === 0) {
            console.log("Seeding Subjects...");
            // Get Program IDs (Assuming programs exist: Hifzul Quran, Al-Alim, etc.)
            // We'll just insert with presumed IDs or fetch them. For robustness, fetch.
            const progRes = await query('SELECT id, name FROM programs');
            const progs = progRes.rows;

            const seedSubjects = [
                { p: 'Hifzul Quran', n: 'Juz 1-5' },
                { p: 'Hifzul Quran', n: 'Tajweed Basics' },
                { p: 'Al-Alim (Boys)', n: 'Fiqh Basics' },
                { p: 'Al-Alim (Boys)', n: 'Arabic Grammar' },
                { p: 'Al-Alimah (Girls)', n: 'Islamic History' },
                { p: 'Al-Alimah (Girls)', n: 'Fiqh' },
                { p: 'O/L', n: 'Mathematics' },
                { p: 'O/L', n: 'Science' },
                { p: 'A/L', n: 'Physics' },
                { p: 'A/L', n: 'Chemistry' }
            ];

            for (const sub of seedSubjects) {
                const prog = progs.find(p => p.name.includes(sub.p)); // Simple fuzzy match
                if (prog) {
                    await query('INSERT INTO subjects (program_id, name) VALUES ($1, $2)', [prog.id, sub.n]);
                }
            }
            console.log("Subjects Seeded.");
        }

        // 3. Schedule / Timetable
        await query(`
            CREATE TABLE IF NOT EXISTS schedule (
                id SERIAL PRIMARY KEY,
                program_id INTEGER REFERENCES programs(id),
                subject_id INTEGER REFERENCES subjects(id),
                teacher_id INTEGER REFERENCES teachers(id),
                day_of_week VARCHAR(20),
                start_time TIME,
                end_time TIME,
                room VARCHAR(50),
                grade_year VARCHAR(50)
            );
        `);
        console.log("Checked/Created 'schedule'");

        // 4. Attendance
        await query(`
            CREATE TABLE IF NOT EXISTS attendance (
                id SERIAL PRIMARY KEY,
                student_id VARCHAR(20) REFERENCES students(id),
                date DATE DEFAULT CURRENT_DATE,
                status VARCHAR(20),
                remarks TEXT,
                UNIQUE(student_id, date)
            );
        `);
        console.log("Checked/Created 'attendance'");

        console.log("Database Update Complete!");
        process.exit(0);
    } catch (err) {
        console.error("Error updating database:", err);
        process.exit(1);
    }
};

createTables();
