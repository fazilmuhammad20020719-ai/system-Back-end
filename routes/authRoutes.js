const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
// const auth = require('../credentials.js'); // Deprecated

// --- LOGIN API ---
// --- LOGIN API ---
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const { query } = require('../db');
        const bcrypt = require('bcrypt');

        // Check user in database
        const result = await query('SELECT * FROM users WHERE username = $1', [username]);

        if (result.rows.length === 0) {
            return res.status(400).json({ message: 'Invalid Username or Password' });
        }

        const user = result.rows[0];

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ message: 'Invalid Username or Password' });
        }

        const token = jwt.sign(
            { user: user.username, role: user.role },
            process.env.JWT_SECRET || 'your_secret_key_123',
            { expiresIn: '12h' }
        );

        return res.json({
            message: 'Login successful',
            token: token,
            user: { username: user.username, role: user.role }
        });

    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ message: 'Server error during login' });
    }
});

module.exports = router;
