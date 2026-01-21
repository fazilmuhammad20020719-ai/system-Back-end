const express = require('express');
const router = express.Router();
const { query } = require('../db');

// 1. GET: Fetch events
router.get('/events', async (req, res) => {
    try {
        const result = await query("SELECT id, title, description, event_type, TO_CHAR(event_date, 'YYYY-MM-DD') as date_str FROM calendar_events ORDER BY event_date ASC");

        // Format for frontend
        const formattedEvents = result.rows.map(event => ({
            id: event.id,
            title: event.title,
            description: event.description,
            type: event.event_type,
            date: event.date_str, // YYYY-MM-DD from DB
            day: new Date(event.date_str).getDate() // Legacy support
        }));

        res.json(formattedEvents);
    } catch (err) {
        console.error("Error fetching events:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

// 2. POST: Create event
router.post('/events', async (req, res) => {
    try {
        console.log("POST /events received body:", req.body);
        const { title, description, date, type } = req.body;

        if (!title || !date) {
            return res.status(400).json({ message: "Title and Date are required" });
        }

        const result = await query(
            'INSERT INTO calendar_events (title, description, event_date, event_type) VALUES ($1, $2, $3, $4) RETURNING *',
            [title, description || '', date, type || 'success']
        );

        res.status(201).json(result.rows[0]);

    } catch (err) {
        console.error("Error creating event:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

// 3. PUT: Update event
router.put('/events/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, type } = req.body; // Date update logic can be added if needed

        const result = await query(
            'UPDATE calendar_events SET title = $1, description = $2, event_type = $3 WHERE id = $4 RETURNING *',
            [title, description, type, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Event not found" });
        }

        res.json(result.rows[0]);

    } catch (err) {
        console.error("Error updating event:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

// 4. DELETE: Delete event
router.delete('/events/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query('DELETE FROM calendar_events WHERE id = $1', [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Event not found" });
        }

        res.json({ message: "Event deleted successfully" });

    } catch (err) {
        console.error("Error deleting event:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

module.exports = router;
