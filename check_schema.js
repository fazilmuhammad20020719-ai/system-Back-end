import { query } from './db.js';

async function test() {
    try {
        const res = await query('SELECT column_name FROM information_schema.columns WHERE table_name = \'programs\' AND column_name = \'duration\'');
        if (res.rows.length > 0) {
            console.log("SUCCESS: Column 'duration' exists.");
        } else {
            console.log("FAILURE: Column 'duration' does NOT exist.");
        }

        const res2 = await query('SELECT column_name FROM information_schema.columns WHERE table_name = \'programs\' AND column_name = \'fees\'');
        if (res2.rows.length > 0) {
            console.log("SUCCESS: Column 'fees' exists.");
        }

        const res3 = await query('SELECT column_name FROM information_schema.columns WHERE table_name = \'programs\' AND column_name = \'status\'');
        if (res3.rows.length > 0) {
            console.log("SUCCESS: Column 'status' exists.");
        }

    } catch (e) {
        console.error("Error:", e);
    }
    process.exit(0);
}
test();
