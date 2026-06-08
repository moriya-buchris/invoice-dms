const fs = require('fs');
const path = require('path');
const { db } = require('../connection');

const MIGRATION_FILE_PATTERN = /^\d{3}_.+\.js$/;

function ensureMigrationsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function getAppliedVersions() {
  return new Set(
    db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((row) => row.version)
  );
}

function recordMigration(version) {
  db.prepare(
    `INSERT INTO schema_migrations (version, applied_at) VALUES (@version, datetime('now'))`
  ).run({ version });
}

function listMigrationFiles() {
  return fs
    .readdirSync(__dirname)
    .filter((file) => MIGRATION_FILE_PATTERN.test(file) && file !== 'migrate.js')
    .sort();
}

function runMigrations() {
  ensureMigrationsTable();
  const appliedVersions = getAppliedVersions();
  const migrationFiles = listMigrationFiles();

  for (const file of migrationFiles) {
    const version = Number(file.slice(0, 3));
    if (appliedVersions.has(version)) {
      continue;
    }

    const migration = require(path.join(__dirname, file));
    if (typeof migration.up !== 'function') {
      throw new Error(`Migration ${file} must export an up(db) function.`);
    }

    const applyMigration = db.transaction(() => {
      migration.up(db);
      recordMigration(version);
    });

    applyMigration();
    console.log(`Applied migration ${file}`);
  }

  console.log('Database migrations complete.');
}

module.exports = { runMigrations };
