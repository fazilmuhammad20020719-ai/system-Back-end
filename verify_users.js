const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
});

async function checkUsers() {
    try {
        const res = await pool.query('SELECT id, username, role, created_at FROM users');
        console.log('--- Current Users in Database ---');
        if (res.rows.length === 0) {
            console.log('No users found.');
        } else {
            console.table(res.rows);
        }
    } catch (err) {
        console.error('Error querying users:', err);
    } finally {
        pool.end();
    }
}

checkUsers();
