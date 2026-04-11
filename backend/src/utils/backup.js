const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const logger = require('./logger');
const { getDb } = require('../models/database');

function getBackupDir() {
  return config.backupDir;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyDirRecursive(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function runBackup() {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace('T', '_')
    .replace(/:/g, '-')
    .split('.')[0];
  const backupName = `backup_${timestamp}`;
  const backupPath = path.join(getBackupDir(), backupName);

  ensureDir(backupPath);

  // Backup SQLite database — checkpoint WAL first so all data is in the main file
  const dbPath = path.join(config.dataDir, 'plc_control.db');
  if (fs.existsSync(dbPath)) {
    try {
      const db = getDb();
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch (err) {
      logger.warn('WAL checkpoint failed before backup', { error: err.message });
    }
    fs.copyFileSync(dbPath, path.join(backupPath, 'plc_control.db'));
  }

  // Backup uploads directory
  const uploadsDir = path.resolve(config.uploadDir);
  if (fs.existsSync(uploadsDir)) {
    copyDirRecursive(uploadsDir, path.join(backupPath, 'uploads'));
  }

  // Calculate backup size
  const size = getDirSize(backupPath);

  logger.info('Backup completed', { name: backupName, size });

  // Apply retention policy
  pruneBackups();

  return { name: backupName, path: backupPath, size, createdAt: now.toISOString() };
}

function getDirSize(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return total;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += getDirSize(fullPath);
    } else {
      try {
        total += fs.statSync(fullPath).size;
      } catch {}
    }
  }
  return total;
}

function listBackups() {
  const backupDir = getBackupDir();
  ensureDir(backupDir);
  const entries = fs.readdirSync(backupDir, { withFileTypes: true });
  const backups = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('backup_')) continue;
    const fullPath = path.join(backupDir, entry.name);
    const stat = fs.statSync(fullPath);
    const size = getDirSize(fullPath);
    backups.push({
      name: entry.name,
      path: fullPath,
      size,
      createdAt: stat.birthtime.toISOString(),
    });
  }
  backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return backups;
}

function pruneBackups() {
  const retention = config.backupRetention;
  const backups = listBackups();
  if (backups.length <= retention) return;
  const toDelete = backups.slice(retention);
  for (const backup of toDelete) {
    try {
      deleteDirRecursive(backup.path);
      logger.info('Old backup deleted', { name: backup.name });
    } catch (err) {
      logger.warn('Failed to delete old backup', { name: backup.name, error: err.message });
    }
  }
}

function deleteDirRecursive(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      deleteDirRecursive(fullPath);
    } else {
      fs.unlinkSync(fullPath);
    }
  }
  fs.rmdirSync(dir);
}

function deleteBackup(name) {
  // Validate name to prevent path traversal
  if (!name || !/^backup_[\d_T-]+$/.test(name)) {
    throw new Error('Invalid backup name');
  }
  const backupPath = path.join(getBackupDir(), name);
  const resolvedPath = path.resolve(backupPath);
  const resolvedBase = path.resolve(getBackupDir());
  if (!resolvedPath.startsWith(resolvedBase + path.sep)) {
    throw new Error('Invalid backup path');
  }
  if (!fs.existsSync(backupPath)) {
    throw new Error('Backup not found');
  }
  deleteDirRecursive(backupPath);
}

function scheduleBackup() {
  const schedule = config.backupSchedule;
  cron.schedule(schedule, () => {
    logger.info('Running scheduled backup...');
    try {
      runBackup();
    } catch (err) {
      logger.error('Backup failed', { error: err.message });
    }
  });
  logger.info(`Backup scheduler started (schedule: ${schedule})`);
}

module.exports = { runBackup, listBackups, deleteBackup, scheduleBackup, getDirSize };
