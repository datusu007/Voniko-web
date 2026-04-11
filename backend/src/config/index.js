require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET;
if (isProduction && (!jwtSecret || jwtSecret === 'plc-control-dev-secret-key')) {
  throw new Error('JWT_SECRET must be set to a secure value in production (NODE_ENV=production)');
}

module.exports = {
  port: parseInt(process.env.PORT) || 3001,
  host: process.env.HOST || '0.0.0.0',
  jwt: {
    secret: jwtSecret || 'plc-control-dev-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  dataDir: process.env.DATA_DIR || './data',
  maxVersionsPerFile: parseInt(process.env.MAX_VERSIONS_PER_FILE) || 10,
  maxRetentionDays: parseInt(process.env.MAX_RETENTION_DAYS) || 365,
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'Admin@123456',
    displayName: process.env.ADMIN_DISPLAY_NAME || 'Administrator',
  },
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
    : null,
  backupDir: process.env.BACKUP_DIR || './data/backups',
  backupSchedule: process.env.BACKUP_SCHEDULE || '0 3 * * *',
  backupRetention: parseInt(process.env.BACKUP_RETENTION) || 7,
};
