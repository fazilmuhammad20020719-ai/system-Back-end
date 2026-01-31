const { query } = require('./db');

async function testSave() {
    try {
        const studentId = 'TEST_9999';
        console.log(`Creating test student ${studentId}...`);

        // 1. Create Student
        const insertQ = `
            INSERT INTO students (id, name, status) 
            VALUES ($1, 'Test Student Multi', 'Active')
            ON CONFLICT (id) DO NOTHING;
        `;
        await query(insertQ, [studentId]);

        // 2. Insert Multiple Enrollments (Simulate Backend Route Logic)
        const enrollments = [
            { programId: 1, currentYear: 'Grade 1', session_year: '2024', status: 'Active', admissionDate: '2024-01-01' },
            { programId: 2, currentYear: 'Level 1', session_year: '2025', status: 'Active', admissionDate: '2025-01-01' }
        ];

        console.log('Clearing old enrollments...');
        await query('DELETE FROM student_enrollments WHERE student_id = $1', [studentId]);

        console.log('Inserting 2 enrollments...');
        for (const enr of enrollments) {
            await query(`
                INSERT INTO student_enrollments (student_id, program_id, current_year, session_year, status, admission_date)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [studentId, enr.programId, enr.currentYear, enr.session_year, enr.status, enr.admissionDate]);
        }

        // 3. Fetch Result (Simulate GET route)
        console.log('Fetching aggregated data...');
        const result = await query(`
            SELECT s.id, 
            COALESCE(
               JSON_AGG(
                   JSON_BUILD_OBJECT(
                       'program_id', se.program_id,
                       'status', se.status,
                       'year', se.current_year,
                       'session', se.session_year
                   ) ORDER BY se.admission_date DESC
               ) FILTER (WHERE se.program_id IS NOT NULL),
               '[]'
            ) as enrollments_summary
            FROM students s
            LEFT JOIN student_enrollments se ON s.id = se.student_id
            WHERE s.id = $1
            GROUP BY s.id
        `, [studentId]);

        console.log('Result:', JSON.stringify(result.rows[0], null, 2));

        // Cleanup
        await query('DELETE FROM student_enrollments WHERE student_id = $1', [studentId]);
        await query('DELETE FROM students WHERE id = $1', [studentId]);

    } catch (err) {
        console.error('Test Failed:', err);
    } finally {
        process.exit();
    }
}

testSave();
