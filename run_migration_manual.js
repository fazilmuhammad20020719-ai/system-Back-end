const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
});

async function run() {
    try {
        await client.connect();
        console.log("Connected to DB.");

        console.log("Adding slot_id column...");
        await client.query("ALTER TABLE exams ADD COLUMN IF NOT EXISTS slot_id INTEGER REFERENCES examination_slots(id) ON DELETE CASCADE;");

        console.log("Adding supervisor_id column...");
        await client.query("ALTER TABLE exams ADD COLUMN IF NOT EXISTS supervisor_id INTEGER REFERENCES teachers(id);");

        console.log("Adding student personal info columns...");
        await client.query("ALTER TABLE students ADD COLUMN IF NOT EXISTS ds_division VARCHAR(100);");
        await client.query("ALTER TABLE students ADD COLUMN IF NOT EXISTS gn_division VARCHAR(100);");
        await client.query("ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_email VARCHAR(100);");
        await client.query("ALTER TABLE students ADD COLUMN IF NOT EXISTS last_studied_grade VARCHAR(50);");
        await client.query("ALTER TABLE students ADD COLUMN IF NOT EXISTS previous_college VARCHAR(150);");

        console.log("Success! Columns added.");

        // Check if it worked
        const res = await client.query("SELECT id, title, slot_id FROM exams ORDER BY id DESC LIMIT 3");
        console.table(res.rows);

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.end();
    }
}

run();
