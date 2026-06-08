const path = require('path');

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function optionalEnv(name, fallback = null) {
  const value = process.env[name];
  return value !== undefined && value !== '' ? value : fallback;
}

const google = {
  clientId: requireEnv('GOOGLE_CLIENT_ID'),
  clientSecret: requireEnv('GOOGLE_CLIENT_SECRET'),
  refreshToken: optionalEnv('GOOGLE_REFRESH_TOKEN'),
  mainFolderId: requireEnv('GOOGLE_DRIVE_MAIN_FOLDER_ID'),
  redirectUri: optionalEnv('GOOGLE_OAUTH_REDIRECT_URI', 'http://localhost:3000/oauth/callback'),
};

if (!google.refreshToken) {
  console.warn(
    'GOOGLE_REFRESH_TOKEN is not set. Open http://localhost:3000/oauth/start to authorize Google Drive + Sheets.'
  );
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  envFilePath: path.join(__dirname, '..', '.env'),
  db: {
    path: optionalEnv('DB_PATH', path.join(__dirname, '..', 'invoices.db')),
  },
  google,
};
