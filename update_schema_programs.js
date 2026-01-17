import { query } from './db.js';

async function updateSchema() {
    try {
        console.log("Updating 'programs' table schema...");

        await query(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS duration VARCHAR(50);`);
        console.log("Added 'duration' column.");

        await query(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS fees VARCHAR(50);`);
        console.log("Added 'fees' column.");

        await query(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active';`);
        console.log("Added 'status' column.");

        console.log("Schema update complete successfully.");
        process.exit(0);
    } catch (err) {
        console.error("Error updating schema:", err);
        process.exit(1);
    }
}

updateSchema();
