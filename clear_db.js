
import { query } from './db.js';
import dotenv from 'dotenv';

dotenv.config();

const clearData = async () => {
    try {
        console.log('Clear Data Script Starting...');

        // Truncate all tables except users
        // RESTART IDENTITY resets sequences (id = 1)
        // CASCADE handles foreign key dependencies automatically
        // Use DELETE instead of TRUNCATE to avoid permission issues
        // Order matters: Delete child tables first
        const queries = [
            'DELETE FROM activities',
            'DELETE FROM alerts',
            'DELETE FROM documents',
            'DELETE FROM students',
            'DELETE FROM teachers',
            'DELETE FROM subjects', // If it exists
            'DELETE FROM programs'
        ];

        for (const q of queries) {
            try {
                await query(q);
                console.log(`Executed: ${q}`);
            } catch (e) {
                console.log(`Skipped (or failed): ${q} - ${e.message}`);
            }
        }

        process.exit(0);
    } catch (err) {
        console.error('Error clearing data:', err);
        process.exit(1);
    }
};

clearData();
