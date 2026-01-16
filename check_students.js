
import { query } from './db.js';

async function checkStudents() {
    try {
        const res = await query('SELECT * FROM students');
        console.log("Student Count:", res.rowCount);
        console.log("Students:", res.rows);
    } catch (err) {
        console.error("DB Error:", err);
    } finally {
        process.exit(0);
    }
}

checkStudents();
