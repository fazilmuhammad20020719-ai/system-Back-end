const { Pool } = require('pg');
require('dotenv').config();

console.log("DB Config:", {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD ? '****' : 'MISSING',
    port: process.env.DB_PORT,
});

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

const alterQueries = [
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

    // File upload columns
    "ALTER TABLE students ADD COLUMN IF NOT EXISTS nic_front TEXT;",
    "ALTER TABLE students ADD COLUMN IF NOT EXISTS nic_back TEXT;",
    "ALTER TABLE students ADD COLUMN IF NOT EXISTS student_signature TEXT;",
    "ALTER TABLE students ADD COLUMN IF NOT EXISTS birth_certificate TEXT;",
    "ALTER TABLE students ADD COLUMN IF NOT EXISTS medical_report TEXT;",
    "ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_nic TEXT;",
    "ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_photo TEXT;",
    "ALTER TABLE students ADD COLUMN IF NOT EXISTS leaving_certificate TEXT;"
];

async function updateSchema() {
    try {
        console.log("Starting schema update...");
        await pool.query('SELECT NOW()'); // Test connection first
        console.log("Connected to DB.");

        for (const query of alterQueries) {
            await pool.query(query);
            console.log(`Executed: ${query}`);
        }

        console.log("Schema update completed successfully.");
    } catch (err) {
        console.error("Error updating schema:", err);
    } finally {
        await pool.end();
    }
}

updateSchema();
