const { query } = require('../db');

/**
 * Logs an activity event to the `activities` table.
 *
 * @param {string} title         - Short event title (e.g. "New student registered")
 * @param {string} description   - Full description of the event
 * @param {string} icon_type     - Lucide icon name: 'UserPlus', 'Edit', 'Trash2', 'FileText', 'Upload', 'Calendar', 'DollarSign', 'Settings', 'Key', 'BookOpen', etc.
 * @param {number|null} program_id - Optional program ID to associate the activity with
 */
const logActivity = async (title, description, icon_type = 'Activity', program_id = null) => {
    try {
        await query(
            `INSERT INTO activities (title, description, icon_type, program_id, created_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [title, description, icon_type, program_id || null]
        );
    } catch (err) {
        // Non-fatal: activity logging should never break the main operation
        console.error('[ActivityLogger] Failed to log activity:', err.message);
    }
};

module.exports = { logActivity };
