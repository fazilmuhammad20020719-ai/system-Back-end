const { pool } = require('./db');

const runMigrations = async () => {
    const alterQueries = [
        // Students Table Updates
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS dob DATE;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS gender VARCHAR(20);",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS nic VARCHAR(20);",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS email VARCHAR(100);",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url TEXT;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS address TEXT;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS city VARCHAR(100);",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS district VARCHAR(100);",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS province VARCHAR(100);",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_relation VARCHAR(50);",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_occupation VARCHAR(100);",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_phone VARCHAR(20);",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS admission_date DATE;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS previous_school VARCHAR(100);",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS medium_of_study VARCHAR(50);",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS nic_front TEXT;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS nic_back TEXT;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS student_signature TEXT;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS birth_certificate TEXT;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS medical_report TEXT;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_nic TEXT;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_photo TEXT;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS leaving_certificate TEXT;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS google_map_link TEXT;",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8);",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);",

        // Teachers Table Updates
        "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS department VARCHAR(100);",
        "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS emp_id VARCHAR(50);",
        "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS designation VARCHAR(100);",
        "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS joining_date DATE;",
        "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100);",
        "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS account_number VARCHAR(50);",
        "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS basic_salary DECIMAL(10, 2);",

        // PROGRAMS Category
        "ALTER TABLE programs ADD COLUMN IF NOT EXISTS category VARCHAR(50);",

        // TEACHERS Category & Assigned Programs
        "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS teacher_category VARCHAR(50);",
        "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS assigned_programs TEXT;",
        "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS nic_front_url TEXT;",
        "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS nic_back_url TEXT;",
        "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS birth_certificate_url TEXT;",

        // Unique Constraint for emp_id
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teachers_emp_id_key') THEN ALTER TABLE teachers ADD CONSTRAINT teachers_emp_id_key UNIQUE (emp_id); END IF; END $$;",

        // Create Tables
        `CREATE TABLE IF NOT EXISTS subjects (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            program_id INTEGER REFERENCES programs(id),
            year VARCHAR(50),
            teacher_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`,

        `CREATE TABLE IF NOT EXISTS teacher_documents (
            id SERIAL PRIMARY KEY,
            teacher_id INTEGER REFERENCES teachers(id),
            name VARCHAR(255) NOT NULL,
            file_url TEXT NOT NULL,
            file_size VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`,

        `CREATE TABLE IF NOT EXISTS teachers (
            id SERIAL PRIMARY KEY,
            emp_id VARCHAR(50) UNIQUE NOT NULL,
            name VARCHAR(100) NOT NULL,
            program_id INTEGER REFERENCES programs(id),
            subject VARCHAR(100),
            designation VARCHAR(100),
            email VARCHAR(100),
            phone VARCHAR(20),
            whatsapp VARCHAR(20),
            address TEXT,
            nic VARCHAR(20),
            dob DATE,
            gender VARCHAR(20),
            marital_status VARCHAR(20),
            joining_date DATE,
            qualification TEXT,
            degree_institute VARCHAR(100),
            grad_year VARCHAR(20),
            appointment_type VARCHAR(50),
            previous_experience TEXT,
            department VARCHAR(100),
            basic_salary DECIMAL(10, 2),
            bank_name VARCHAR(100),
            account_number VARCHAR(50),
            photo_url TEXT,
            cv_url TEXT,
            certificates_url TEXT,
            nic_copy_url TEXT,
            nic_front_url TEXT,
            nic_back_url TEXT,
            birth_certificate_url TEXT,
            status VARCHAR(20) DEFAULT 'Active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`,

        // Rename 'attendance' to 'student_attendance' if exists (Preserve Data)
        "DO $$ BEGIN IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'attendance') THEN ALTER TABLE attendance RENAME TO student_attendance; END IF; END $$;",

        // Rename 'remarks' to 'reason' if exists in student_attendance
        "DO $$ BEGIN IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'student_attendance' AND column_name = 'remarks') THEN ALTER TABLE student_attendance RENAME COLUMN remarks TO reason; END IF; END $$;",

        `CREATE TABLE IF NOT EXISTS student_attendance (
            id SERIAL PRIMARY KEY,
            student_id VARCHAR(20) REFERENCES students(id),
            teacher_id INTEGER REFERENCES teachers(id),
            date DATE NOT NULL,
            status VARCHAR(20),
            reason TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_student_date UNIQUE (student_id, date),
            CONSTRAINT unique_teacher_date UNIQUE (teacher_id, date)
        );`,

        `CREATE TABLE IF NOT EXISTS calendar_events (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            event_date DATE NOT NULL,
            event_type VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`,

        `CREATE TABLE IF NOT EXISTS schedules (
            id SERIAL PRIMARY KEY,
            program_id INTEGER, 
            subject_id INTEGER NOT NULL,
            teacher_id INTEGER NOT NULL,
            day_of_week VARCHAR(20) NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            room VARCHAR(50),
            grade_year VARCHAR(50),
            start_date DATE,
            end_date DATE,
            type VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`,

        `CREATE TABLE IF NOT EXISTS class_sessions (
            id SERIAL PRIMARY KEY,
            schedule_id INTEGER REFERENCES schedules(id) ON DELETE CASCADE,
            date DATE NOT NULL,
            status VARCHAR(20) DEFAULT 'Completed', -- Completed, Cancelled
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_session UNIQUE (schedule_id, date)
        );`,

        `CREATE TABLE IF NOT EXISTS examination_slots (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            program_id INTEGER REFERENCES programs(id),
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            status VARCHAR(50) DEFAULT 'Upcoming', -- Upcoming, Ongoing, Completed
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`,

        // Fix permissions for examination_slots
        "GRANT ALL PRIVILEGES ON TABLE examination_slots TO PUBLIC;",

        `CREATE TABLE IF NOT EXISTS exams (
            id SERIAL PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            slot_id INTEGER REFERENCES examination_slots(id) ON DELETE CASCADE,
            program_id INTEGER REFERENCES programs(id),
            subject_id INTEGER REFERENCES subjects(id),
            exam_date DATE NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            venue VARCHAR(100),
            total_marks INTEGER,
            status VARCHAR(20) DEFAULT 'Upcoming',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`,

        `CREATE TABLE IF NOT EXISTS exam_results (
            id SERIAL PRIMARY KEY,
            exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
            student_id VARCHAR(50) REFERENCES students(id) ON DELETE CASCADE,
            marks_obtained INTEGER,
            grade VARCHAR(10),
            status VARCHAR(20) DEFAULT 'Pending',
            remarks TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(exam_id, student_id)
        );`,

        // --- MULTI-PART EXAM MIGRATION ---
        // 1. Add exam_type to exams
        "ALTER TABLE exams ADD COLUMN IF NOT EXISTS exam_type VARCHAR(20) DEFAULT 'Single';", // Single, Multi

        // 2. Create exam_parts table
        `CREATE TABLE IF NOT EXISTS exam_parts (
            id SERIAL PRIMARY KEY,
            exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
            name VARCHAR(100) DEFAULT 'Main Exam',
            exam_date DATE NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            venue VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`,

        // 3. Migrate existing data: Create a default part for exams that don't have parts yet (and have legacy data)
        `INSERT INTO exam_parts (exam_id, name, exam_date, start_time, end_time, venue)
         SELECT id, 'Main Exam', exam_date, start_time, end_time, venue
         FROM exams
         WHERE id NOT IN (SELECT DISTINCT exam_id FROM exam_parts)
         AND exam_date IS NOT NULL;`,

        // --- TEACHER ATTENDANCE TABLE ---
        `CREATE TABLE IF NOT EXISTS teacher_attendance (
            id SERIAL PRIMARY KEY,
            teacher_id INTEGER REFERENCES teachers(id),
            date DATE NOT NULL,
            status VARCHAR(20), -- Present, Absent, Holiday, Late, Leave
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_teacher_attendance UNIQUE (teacher_id, date)
        );`
    ];

    try {
        const client = await pool.connect();
        try {
            for (const q of alterQueries) {
                await client.query(q);
            }
            console.log("Database schema checked/updated successfully.");
        } finally {
            client.release();
        }
    } catch (err) {
        console.error("Migration warning:", err.message);
    }
};

module.exports = runMigrations;
