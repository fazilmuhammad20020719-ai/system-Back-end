import { query } from './db.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const seed = async () => {
    try {
        console.log('Running schema migration...');

        // Read and execute schema.sql to ensure tables exist
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        await query(schemaSql);
        console.log('Schema migration complete.');

        // Seed Admin User
        const password = 'Admin1234#';
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        const check = await query('SELECT * FROM users WHERE username = $1', ['admin']);
        if (check.rows.length === 0) {
            console.log('Creating admin user...');
            await query('INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)', ['admin', hash, 'admin']);
        }



        console.log('Seeding complete.');
        process.exit(0);
    } catch (err) {
        console.error('Seeding failed:', err);
        process.exit(1);
    }
};

seed();
