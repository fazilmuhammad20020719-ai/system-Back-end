const { pool } = require('./db');

async function fixTeacherData() {
    try {
        console.log("Starting Teacher Data Cleanup...");
        const res = await pool.query('SELECT id, name, assigned_programs FROM teachers');

        for (const teacher of res.rows) {
            if (teacher.assigned_programs) {
                // Split, trim, filter empty, and unique
                const programs = teacher.assigned_programs
                    .split(',')
                    .map(p => p.trim())
                    .filter(p => p !== '');

                const uniquePrograms = [...new Set(programs)];

                const uniqueString = uniquePrograms.join(', ');

                if (uniqueString !== teacher.assigned_programs) {
                    console.log(`Fixing teacher ${teacher.name} (ID: ${teacher.id})`);
                    console.log(`  Old: ${teacher.assigned_programs}`);
                    console.log(`  New: ${uniqueString}`);

                    await pool.query('UPDATE teachers SET assigned_programs = $1 WHERE id = $2', [uniqueString, teacher.id]);
                }
            }
        }
        console.log("Cleanup complete.");
    } catch (err) {
        console.error("Error during cleanup:", err);
    }
}

fixTeacherData();
