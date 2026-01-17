
const { query } = require('./db');

async function updateSchema() {
    try {
        // 1. Add teacher_id column to subjects table if it doesn't exist
        await query(`
            ALTER TABLE subjects 
            ADD COLUMN IF NOT EXISTS teacher_id INTEGER REFERENCES teachers(id);
        `);
        console.log("Added teacher_id column to subjects table.");

        console.log("Schema update complete!");
    } catch (err) {
        console.error("Error updating schema:", err);
    }
}

updateSchema();
