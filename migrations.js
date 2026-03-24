const { query } = require('./db');

async function runMigrations() {
    try {
        console.log('Running database migrations...');

        // Documents table — uses file_url, category, starred, pinned, trashed columns
        await query(`
            CREATE TABLE IF NOT EXISTS documents (
                id          SERIAL PRIMARY KEY,
                name        VARCHAR(255) NOT NULL,
                file_url    TEXT,
                type        VARCHAR(50)  NOT NULL DEFAULT 'unknown',
                size        VARCHAR(50),
                category    VARCHAR(100) NOT NULL DEFAULT 'root',
                starred     BOOLEAN      NOT NULL DEFAULT false,
                pinned      BOOLEAN      NOT NULL DEFAULT false,
                trashed     BOOLEAN      NOT NULL DEFAULT false,
                upload_date TIMESTAMP    DEFAULT NOW()
            )
        `);

        // Add any missing columns to an existing documents table (safe ALTER TABLE)
        const docColumns = [
            { col: 'file_url',    def: 'TEXT' },
            { col: 'size',        def: 'VARCHAR(50)' },
            { col: 'category',    def: "VARCHAR(100) NOT NULL DEFAULT 'root'" },
            { col: 'starred',     def: 'BOOLEAN NOT NULL DEFAULT false' },
            { col: 'pinned',      def: 'BOOLEAN NOT NULL DEFAULT false' },
            { col: 'trashed',     def: 'BOOLEAN NOT NULL DEFAULT false' },
            { col: 'upload_date', def: 'TIMESTAMP DEFAULT NOW()' },
        ];
        for (const { col, def } of docColumns) {
            await query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS ${col} ${def}`);
        }

        // Document folders table
        await query(`
            CREATE TABLE IF NOT EXISTS document_folders (
                id         VARCHAR(100) PRIMARY KEY,
                name       VARCHAR(255) NOT NULL,
                parent_id  VARCHAR(100) NOT NULL DEFAULT 'root',
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        console.log('Migrations completed successfully.');
    } catch (err) {
        console.error('Migration error:', err);
    }
}

module.exports = runMigrations;
