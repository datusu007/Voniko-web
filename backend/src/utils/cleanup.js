const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { getDb } = require('../models/database');
const logger = require('../utils/logger');

function runCleanup() {
  const db = getDb();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - config.maxRetentionDays);
  const cutoffIso = cutoffDate.toISOString().replace('T', ' ').split('.')[0];

  // Get all file IDs
  const files = db.prepare('SELECT id FROM files').all();

  let deletedCount = 0;

  for (const file of files) {
    // Get versions ordered by version_number desc
    const versions = db
      .prepare('SELECT id, version_number, storage_path, created_at FROM versions WHERE file_id = ? ORDER BY version_number DESC')
      .all(file.id);

    const toDelete = [];

    for (let i = 0; i < versions.length; i++) {
      const v = versions[i];
      // Keep latest N versions, delete rest if over limit or too old
      if (i >= config.maxVersionsPerFile || v.created_at < cutoffIso) {
        toDelete.push(v);
      }
    }

    for (const v of toDelete) {
      // Delete physical file
      try {
        if (fs.existsSync(v.storage_path)) {
          fs.unlinkSync(v.storage_path);
        }
      } catch (err) {
        logger.warn('Failed to delete version file', { path: v.storage_path, error: err.message });
      }

      db.prepare('DELETE FROM versions WHERE id = ?').run(v.id);
      deletedCount++;
    }
  }

  if (deletedCount > 0) {
    logger.info('Cleanup completed', { deletedVersions: deletedCount });
  }
}

function scheduleCleanup() {
  // Run daily at 2 AM (cron syntax: minute hour day month weekday)
  cron.schedule('0 2 * * *', () => {
    logger.info('Running scheduled cleanup...');
    try {
      runCleanup();
    } catch (err) {
      logger.error('Cleanup failed', { error: err.message });
    }
  });
  logger.info('Cleanup scheduler started (daily at 02:00)');
}

module.exports = { scheduleCleanup, runCleanup };
