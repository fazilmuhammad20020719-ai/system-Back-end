import { query } from './db.js';

const updateSchema = async () => {
    try {
        console.log("Starting schema update for students table...");

        const alterQueries = [
            "ALTER TABLE students ADD COLUMN IF NOT EXISTS dob DATE;",
            "ALTER TABLE students ADD COLUMN IF NOT EXISTS gender VARCHAR(10);",
            "ALTER TABLE students ADD COLUMN IF NOT EXISTS nic VARCHAR(20);",
            "ALTER TABLE students ADD COLUMN IF NOT EXISTS email VARCHAR(100);",
            "ALTER TABLE students ADD COLUMN IF NOT EXISTS address TEXT;",
            "ALTER TABLE students ADD COLUMN IF NOT EXISTS city VARCHAR(50);",
            "ALTER TABLE students ADD COLUMN IF NOT EXISTS district VARCHAR(50);",
            "ALTER TABLE students ADD COLUMN IF NOT EXISTS province VARCHAR(50);",
            "ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_relation VARCHAR(50);",
            "ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_occupation VARCHAR(100);",
            "ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_phone VARCHAR(20);",
            "ALTER TABLE students ADD COLUMN IF NOT EXISTS admission_date DATE;",
            "ALTER TABLE students ADD COLUMN IF NOT EXISTS previous_school VARCHAR(100);",
            "ALTER TABLE students ADD COLUMN IF NOT EXISTS medium_of_study VARCHAR(50);"
        ];

        for (const q of alterQueries) {
            await query(q);
            console.log(`Executed: ${q}`);
        }

        console.log("Schema update completed successfully.");
        process.exit(0);
    } catch (err) {
        console.error("Error updating schema:", err);
        process.exit(1);
    }
};

updateSchema();
