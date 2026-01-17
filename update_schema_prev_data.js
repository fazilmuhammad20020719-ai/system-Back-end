import { query } from './db.js';

const updateSchemaPreviousData = async () => {
    try {
        console.log("Adding missing Previous Education columns...");

        const alterQueries = [
            "ALTER TABLE students ADD COLUMN IF NOT EXISTS last_studied_grade VARCHAR(50);",
            "ALTER TABLE students ADD COLUMN IF NOT EXISTS previous_school_location VARCHAR(100);",
            "ALTER TABLE students ADD COLUMN IF NOT EXISTS reason_for_leaving VARCHAR(255);",
            "ALTER TABLE students ADD COLUMN IF NOT EXISTS previous_college VARCHAR(100);", // Madrasa Name
            "ALTER TABLE students ADD COLUMN IF NOT EXISTS previous_college_location VARCHAR(100);",
            "ALTER TABLE students ADD COLUMN IF NOT EXISTS reason_for_leaving_madrasa VARCHAR(255);"
        ];

        for (const q of alterQueries) {
            await query(q);
            console.log(`Executed: ${q}`);
        }

        console.log("Schema update for Previous Data completed.");
        process.exit(0);
    } catch (err) {
        console.error("Error updating schema:", err);
        process.exit(1);
    }
};

updateSchemaPreviousData();
