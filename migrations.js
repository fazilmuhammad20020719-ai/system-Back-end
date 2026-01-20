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
            status VARCHAR(20) DEFAULT 'Active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
