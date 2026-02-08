const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
});

async function seedAdmin() {
    const username = 'Fmacadmin';
    const password = 'Fmac2002#';
    const role = 'admin';

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const queryText = `
            INSERT INTO users (username, password_hash, role)
            VALUES ($1, $2, $3)
            ON CONFLICT (username) 
            DO UPDATE SET password_hash = $2
            RETURNING id, username, role;
        `;

        const res = await pool.query(queryText, [username, hashedPassword, role]);
        console.log('Admin user seeded successfully:', res.rows[0]);
    } catch (err) {
        console.error('Error seeding admin user:', err);
    } finally {
        pool.end();
    }
}

seedAdmin();
