const { pool } = require('./db');

async function checkSchema() {
    try {
        console.log("Checking 'exams' table columns...");
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'exams';
        `);
        console.table(res.rows);

        console.log("\nChecking last 5 exams...");
        const exams = await pool.query('SELECT id, title, slot_id FROM exams ORDER BY id DESC LIMIT 5');
        console.table(exams.rows);

    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

checkSchema();
