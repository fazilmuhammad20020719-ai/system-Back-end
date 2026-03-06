const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { errorLogs, getSystemPaused, setSystemPaused } = require('../server');

const DEV_USERNAME = process.env.DEV_USERNAME || 'developer';
const DEV_PASSWORD = process.env.DEV_PASSWORD || 'devpass123';
const DEV_SECRET = process.env.DEV_SECRET || 'dev_secret_key_xyz';

// Middleware to verify dev token
const verifyDev = (req, res, next) => {
    const auth = req.headers['authorization'];
    if (!auth) return res.status(401).json({ message: 'Unauthorized' });
    try {
        const decoded = jwt.verify(auth.split(' ')[1], DEV_SECRET);
        req.dev = decoded;
        next();
    } catch {
        res.status(401).json({ message: 'Invalid or expired token' });
    }
};

// POST /api/controller/login
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username !== DEV_USERNAME || password !== DEV_PASSWORD) {
        return res.status(401).json({ message: 'Invalid developer credentials' });
    }
    const token = jwt.sign({ username, role: 'developer' }, DEV_SECRET, { expiresIn: '8h' });
    res.json({ token, username });
});

// GET /api/controller/tables  — list all tables with row counts + columns
router.get('/tables', verifyDev, async (req, res) => {
    try {
        // All user tables
        const tablesRes = await query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `);

        const tables = await Promise.all(tablesRes.rows.map(async ({ table_name }) => {
            // Row count
            const countRes = await query(`SELECT COUNT(*) as count FROM "${table_name}"`);
            const rowCount = parseInt(countRes.rows[0].count);

            // Columns
            const colsRes = await query(`
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = $1
                ORDER BY ordinal_position
            `, [table_name]);

            return {
                name: table_name,
                rowCount,
                columns: colsRes.rows
            };
        }));

        res.json({ tables });
    } catch (err) {
        console.error('Controller tables error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/controller/table/:name/data  — preview first 50 rows
router.get('/table/:name/data', verifyDev, async (req, res) => {
    try {
        const { name } = req.params;
        // Validate table name exists to prevent SQL injection
        const check = await query(
            `SELECT table_name FROM information_schema.tables
             WHERE table_schema='public' AND table_name=$1`, [name]
        );
        if (check.rows.length === 0) return res.status(404).json({ message: 'Table not found' });

        const dataRes = await query(`SELECT * FROM "${name}" LIMIT 50`);
        res.json({ rows: dataRes.rows, fields: dataRes.fields?.map(f => f.name) || [] });
    } catch (err) {
        console.error('Preview error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/controller/query  — run custom SQL (SELECT only)
router.post('/query', verifyDev, async (req, res) => {
    try {
        const { sql } = req.body;
        if (!sql || !sql.trim()) return res.status(400).json({ message: 'No query provided' });

        const trimmed = sql.trim().toUpperCase();
        // Safety: only allow SELECT statements
        if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
            return res.status(400).json({ message: 'Only SELECT queries are allowed' });
        }

        const result = await query(sql);
        const fields = result.fields?.map(f => f.name) || (result.rows.length > 0 ? Object.keys(result.rows[0]) : []);
        res.json({ rows: result.rows, fields, rowCount: result.rowCount });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// GET /api/controller/logs — return in-memory error logs
router.get('/logs', verifyDev, (req, res) => {
    let logs = [...errorLogs];

    // Filter by type
    const { type, search, page = 1, limit = 100 } = req.query;
    if (type && type !== 'all') {
        logs = logs.filter(l => l.type === type);
    }
    if (search) {
        const q = search.toLowerCase();
        logs = logs.filter(l =>
            l.message.toLowerCase().includes(q) ||
            (l.route && l.route.toLowerCase().includes(q)) ||
            (l.stack && l.stack.toLowerCase().includes(q))
        );
    }

    const total = logs.length;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
    const start = (pageNum - 1) * limitNum;
    logs = logs.slice(start, start + limitNum);

    // Counts per type from the full store
    const counts = {
        all: errorLogs.length,
        server: errorLogs.filter(l => l.type === 'server').length,
        database: errorLogs.filter(l => l.type === 'database').length,
        system: errorLogs.filter(l => l.type === 'system').length,
    };

    res.json({ logs, total, counts, page: pageNum, limit: limitNum });
});

// DELETE /api/controller/logs — clear all logs
router.delete('/logs', verifyDev, (_req, res) => {
    errorLogs.splice(0, errorLogs.length);
    res.json({ message: 'Logs cleared' });
});

// GET /api/controller/system/status — get current system paused state (dev only)
router.get('/system/status', verifyDev, (_req, res) => {
    res.json({ paused: getSystemPaused() });
});

// GET /api/controller/system/status/public — public read-only status (no auth required)
// Used by the frontend overlay to detect when the system is paused
router.get('/system/status/public', (_req, res) => {
    res.json({ paused: getSystemPaused() });
});

// POST /api/controller/system/pause — pause the system
router.post('/system/pause', verifyDev, (_req, res) => {
    setSystemPaused(true);
    console.error('System paused by developer');
    res.json({ paused: true, message: 'System paused. All public API routes are now blocked.' });
});

// POST /api/controller/system/unpause — resume the system
router.post('/system/unpause', verifyDev, (_req, res) => {
    setSystemPaused(false);
    res.json({ paused: false, message: 'System resumed. All routes are now active.' });
});

// DELETE /api/controller/table/:name/row — delete a single row by primary key
router.delete('/table/:name/row', verifyDev, async (req, res) => {
    try {
        const { name } = req.params;
        const { pkColumn, pkValue } = req.body;

        if (!pkColumn || pkValue === undefined) {
            return res.status(400).json({ message: 'pkColumn and pkValue are required' });
        }

        // Validate table exists
        const tableCheck = await query(
            `SELECT table_name FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = $1`, [name]
        );
        if (tableCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Table not found' });
        }

        // Validate pkColumn belongs to this table (prevents SQL injection via column name)
        const colCheck = await query(
            `SELECT column_name FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
            [name, pkColumn]
        );
        if (colCheck.rows.length === 0) {
            return res.status(400).json({ message: 'Invalid column name' });
        }

        const result = await query(`DELETE FROM "${name}" WHERE "${pkColumn}" = $1`, [pkValue]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Row not found or already deleted' });
        }

        res.json({ message: 'Row deleted successfully', rowCount: result.rowCount });
    } catch (err) {
        console.error('Delete row error:', err);
        res.status(500).json({ message: 'Failed to delete row: ' + err.message });
    }
});

// DELETE /api/controller/table/:name/data — truncate all rows in a table

router.delete('/table/:name/data', verifyDev, async (req, res) => {
    try {
        const { name } = req.params;

        // Validate table exists in public schema (prevents SQL injection)
        const check = await query(
            `SELECT table_name FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = $1`, [name]
        );
        if (check.rows.length === 0) {
            return res.status(404).json({ message: 'Table not found' });
        }

        // Get row count before truncating (for the response)
        const countBefore = await query(`SELECT COUNT(*) as count FROM "${name}"`);
        const rowsDeleted = parseInt(countBefore.rows[0].count);

        // TRUNCATE: removes all rows, resets identity sequences, cascades to FK children
        await query(`TRUNCATE TABLE "${name}" RESTART IDENTITY CASCADE`);

        console.log(`[Controller] Table "${name}" truncated — ${rowsDeleted} rows deleted.`);
        res.json({ message: `Table "${name}" cleared successfully.`, rowsDeleted });
    } catch (err) {
        console.error('Delete table data error:', err);
        res.status(500).json({ message: 'Failed to delete table data: ' + err.message });
    }
});

// GET /api/controller/export?includeData=true|false — export full DB as SQL file
router.get('/export', verifyDev, async (req, res) => {
    const includeData = req.query.includeData === 'true';
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `fmac_db_${includeData ? 'full' : 'schema'}_${ts}.sql`;

    try {
        // 1. Get all tables in order
        const tablesRes = await query(`
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `);
        const tableNames = tablesRes.rows.map(r => r.table_name);

        let sql = '';
        sql += `-- FMAC Database Export\n`;
        sql += `-- Generated: ${new Date().toISOString()}\n`;
        sql += `-- Mode: ${includeData ? 'Schema + Data' : 'Schema Only'}\n`;
        sql += `-- Tables: ${tableNames.length}\n\n`;
        sql += `SET client_encoding = 'UTF8';\n`;
        sql += `SET standard_conforming_strings = on;\n\n`;

        for (const tableName of tableNames) {
            // ── Column definitions ──────────────────────────────────────────
            const colsRes = await query(`
                SELECT column_name, data_type, character_maximum_length,
                       numeric_precision, numeric_scale,
                       is_nullable, column_default, udt_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = $1
                ORDER BY ordinal_position
            `, [tableName]);

            // ── Constraints (PK, UNIQUE, FK) ────────────────────────────────
            const conRes = await query(`
                SELECT tc.constraint_type, tc.constraint_name,
                       kcu.column_name,
                       ccu.table_name  AS foreign_table,
                       ccu.column_name AS foreign_column,
                       rc.update_rule, rc.delete_rule
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                     ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                LEFT JOIN information_schema.constraint_column_usage ccu
                     ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
                LEFT JOIN information_schema.referential_constraints rc
                     ON rc.constraint_name = tc.constraint_name
                WHERE tc.table_schema = 'public' AND tc.table_name = $1
                ORDER BY tc.constraint_type, tc.constraint_name, kcu.ordinal_position
            `, [tableName]);

            // Group PK columns
            const pkCols = conRes.rows.filter(r => r.constraint_type === 'PRIMARY KEY').map(r => r.column_name);
            // Group UNIQUE constraints (by constraint name)
            const uniqueMap = {};
            conRes.rows.filter(r => r.constraint_type === 'UNIQUE').forEach(r => {
                if (!uniqueMap[r.constraint_name]) uniqueMap[r.constraint_name] = [];
                uniqueMap[r.constraint_name].push(r.column_name);
            });
            // FK constraints
            const fks = conRes.rows.filter(r => r.constraint_type === 'FOREIGN KEY');

            // Build column SQL
            const colDefs = colsRes.rows.map(col => {
                let type = col.data_type.toUpperCase();
                if (type === 'CHARACTER VARYING') type = col.character_maximum_length ? `VARCHAR(${col.character_maximum_length})` : 'VARCHAR';
                if (type === 'CHARACTER') type = col.character_maximum_length ? `CHAR(${col.character_maximum_length})` : 'CHAR';
                if (type === 'NUMERIC' && col.numeric_precision) type = col.numeric_scale ? `NUMERIC(${col.numeric_precision},${col.numeric_scale})` : `NUMERIC(${col.numeric_precision})`;
                if (type === 'USER-DEFINED') type = col.udt_name.toUpperCase();

                let def = `    "${col.column_name}" ${type}`;
                if (col.column_default) {
                    // Strip internal sequence names — keep as-is for portability
                    def += ` DEFAULT ${col.column_default}`;
                }
                if (col.is_nullable === 'NO') def += ' NOT NULL';
                return def;
            });

            if (pkCols.length > 0) {
                colDefs.push(`    PRIMARY KEY (${pkCols.map(c => `"${c}"`).join(', ')})`);
            }
            Object.entries(uniqueMap).forEach(([name, cols]) => {
                colDefs.push(`    CONSTRAINT "${name}" UNIQUE (${cols.map(c => `"${c}"`).join(', ')})`);
            });
            fks.forEach(fk => {
                colDefs.push(`    FOREIGN KEY ("${fk.column_name}") REFERENCES "${fk.foreign_table}" ("${fk.foreign_column}") ON UPDATE ${fk.update_rule} ON DELETE ${fk.delete_rule}`);
            });

            sql += `-- Table: ${tableName}\n`;
            sql += `DROP TABLE IF EXISTS "${tableName}" CASCADE;\n`;
            sql += `CREATE TABLE "${tableName}" (\n${colDefs.join(',\n')}\n);\n\n`;

            // ── Data (INSERT INTO) ───────────────────────────────────────────
            if (includeData) {
                const dataRes = await query(`SELECT * FROM "${tableName}"`);
                if (dataRes.rows.length > 0) {
                    const fields = dataRes.fields.map(f => `"${f.name}"`).join(', ');
                    sql += `-- Data for table: ${tableName} (${dataRes.rows.length} rows)\n`;
                    const BATCH = 100;
                    for (let i = 0; i < dataRes.rows.length; i += BATCH) {
                        const batch = dataRes.rows.slice(i, i + BATCH);
                        const values = batch.map(row =>
                            `(${dataRes.fields.map(f => {
                                const v = row[f.name];
                                if (v === null) return 'NULL';
                                if (typeof v === 'number' || typeof v === 'boolean') return String(v);
                                if (v instanceof Date) return `'${v.toISOString()}'`;
                                return `'${String(v).replace(/'/g, "''")}'`;
                            }).join(', ')})`
                        ).join(',\n');
                        sql += `INSERT INTO "${tableName}" (${fields}) VALUES\n${values};\n`;
                    }
                    sql += '\n';
                }
            }
        }

        sql += `-- End of export\n`;

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(sql);
    } catch (err) {
        console.error('DB export error:', err);
        res.status(500).json({ message: 'Export failed: ' + err.message });
    }
});

module.exports = router;
