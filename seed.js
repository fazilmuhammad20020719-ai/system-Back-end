const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// டேட்டாபேஸ் இணைப்பு விவரங்கள்
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

const seed = async () => {
    try {
        console.log('Running schema migration...');

        // 1. schema.sql கோப்பை வாசித்தல்
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        // 2. டேபிள்களை உருவாக்குதல்
        await pool.query(schemaSql);
        console.log('Schema migration complete.');

        // லாகின் விவரங்கள் credentials.js மூலம் கையாளப்படுவதால் 
        // அட்மின் உருவாக்கும் பகுதி இங்கே நீக்கப்பட்டுள்ளது.

        console.log('Seeding complete.');
        process.exit(0);
    } catch (err) {
        console.error('Seeding failed:', err);
        process.exit(1);
    }
};

seed();