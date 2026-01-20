const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const auth = require('../credentials.js');

// --- LOGIN API ---
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    // Check credentials against credentials.js
    if (username === auth.adminUser && password === auth.adminPass) {
        const token = jwt.sign(
            { user: username },
            process.env.JWT_SECRET || 'your_secret_key_123',
            { expiresIn: '12h' }
        );

        return res.json({
            message: 'Login successful',
            token: token,
            user: { username: username, role: 'admin' }
        });
    } else {
        return res.status(400).json({ message: 'Invalid Username or Password' });
    }
});

module.exports = router;
