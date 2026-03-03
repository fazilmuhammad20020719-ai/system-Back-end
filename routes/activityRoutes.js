const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/activities?range=today|3days|7days|30days&program_id=123
router.get('/', async (req, res) => {
    try {
        const { range, program_id } = req.query;
        let timeFilter = '';
        const params = [];

        switch (range) {
            case 'today':
                timeFilter = `created_at >= CURRENT_DATE`;
                break;
            case '3days':
                timeFilter = `created_at >= CURRENT_DATE - INTERVAL '3 days'`;
                break;
            case '7days':
                timeFilter = `created_at >= CURRENT_DATE - INTERVAL '7 days'`;
                break;
            case '30days':
                timeFilter = `created_at >= CURRENT_DATE - INTERVAL '30 days'`;
                break;
            default:
                // Default to all or perhaps just limit if no range provided
                timeFilter = '';
        }

        let whereClauses = [];
        if (timeFilter) {
            whereClauses.push(timeFilter);
        }

        if (program_id) {
            params.push(program_id);
            whereClauses.push(`program_id = $${params.length}`);
        }

        const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const query = `
            SELECT * 
            FROM activities 
            ${whereString} 
            ORDER BY created_at DESC 
            ${whereString === '' && !program_id ? 'LIMIT 100' : ''}
        `;

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching activities:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
