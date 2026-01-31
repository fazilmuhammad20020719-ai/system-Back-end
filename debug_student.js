const { query } = require('./db');

async function debugStudent() {
    try {
        const id = 494;
        console.log(`Checking data for student ${id}...`);

        const student = await query('SELECT * FROM students WHERE id = $1', [id]);
        console.log('Student Legacy Data:', {
            program_id: student.rows[0]?.program_id,
            session_year: student.rows[0]?.session_year,
            current_year: student.rows[0]?.current_year
        });

        const enrollments = await query('SELECT * FROM student_enrollments WHERE student_id = $1', [id]);
        console.log('Enrollments Table Data:', enrollments.rows);

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

debugStudent();
