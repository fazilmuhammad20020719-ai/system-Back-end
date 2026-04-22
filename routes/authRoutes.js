const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const bcrypt = require('bcryptjs');
const { logActivity } = require('../utils/activityLogger');

// --- LOGIN API ---
// --- LOGIN API ---
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const { query } = require('../db');
        const bcrypt = require('bcryptjs');

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

// --- GET PROFILE ---
router.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader) return res.status(401).json({ message: 'Unauthorized' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key_123');
        const result = await query('SELECT id, username, full_name, role FROM users WHERE username = $1', [decoded.user]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Get profile error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- UPDATE PROFILE (name, username, password) ---
router.put('/me', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader) return res.status(401).json({ message: 'Unauthorized' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key_123');

        const { fullName, newUsername, currentPassword, newPassword } = req.body;

        // Fetch current user
        const userRes = await query('SELECT * FROM users WHERE username = $1', [decoded.user]);
        if (userRes.rows.length === 0) return res.status(404).json({ message: 'User not found' });
        const user = userRes.rows[0];

        // If changing password, verify current password first
        if (newPassword) {
            if (!currentPassword) return res.status(400).json({ message: 'Current password is required to set a new password' });
            const valid = await bcrypt.compare(currentPassword, user.password_hash);
            if (!valid) return res.status(400).json({ message: 'Current password is incorrect' });
        }

        // Check new username not taken by someone else
        if (newUsername && newUsername !== user.username) {
            const conflict = await query('SELECT id FROM users WHERE username = $1', [newUsername]);
            if (conflict.rows.length > 0) return res.status(400).json({ message: 'Username already taken' });
        }

        const updatedName = fullName || user.full_name;
        const updatedUsername = newUsername || user.username;
        const updatedHash = newPassword ? await bcrypt.hash(newPassword, 10) : user.password_hash;

        await query(
            'UPDATE users SET full_name = $1, username = $2, password_hash = $3 WHERE id = $4',
            [updatedName, updatedUsername, updatedHash, user.id]
        );

        await logActivity('Admin profile updated', `Admin "${updatedUsername}" updated their profile.`, 'Settings');

        // Issue a fresh token with the (possibly new) username
        const newToken = jwt.sign(
            { user: updatedUsername, role: user.role },
            process.env.JWT_SECRET || 'your_secret_key_123',
            { expiresIn: '12h' }
        );

        res.json({ message: 'Profile updated successfully', token: newToken, user: { username: updatedUsername, role: user.role } });
    } catch (err) {
        console.error('Update profile error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
