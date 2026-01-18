const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function checkStudent() {
    try {
        const res = await pool.query("SELECT id, name, photo_url FROM students WHERE id = '2025030'");
        console.log("Student Data:", res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

checkStudent();
