const fs = require('fs');
const { google } = require('googleapis');

const config = require('../../config');
const { GOOGLE_SCOPES } = require('../../config/constants');
const GoogleAuthRequiredError = require('../../errors/GoogleAuthRequiredError');

let inMemoryRefreshToken = config.google.refreshToken;

function createOAuth2Client() {
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri
  );
}

function getRefreshToken() {
  return inMemoryRefreshToken || process.env.GOOGLE_REFRESH_TOKEN || null;
}

function getAuthUrl() {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
  });
}

function printAuthInstructions(authUrl) {
  console.log('\n========== GOOGLE OAUTH REQUIRED ==========');
  console.log('Open this URL in your browser to authorize Drive + Sheets:');
  console.log(authUrl);
  console.log('Or visit: http://localhost:3000/oauth/start');
  console.log('After approval you will land on /oauth/callback');
  console.log('===========================================\n');
}

function printNewRefreshToken(token) {
  console.log('\n========== NEW GOOGLE_REFRESH_TOKEN ==========');
  console.log('NEW TOKEN:', token);
  console.log(`GOOGLE_REFRESH_TOKEN=${token}`);
  console.log('===============================================\n');
}

function saveRefreshTokenToEnv(refreshToken) {
  let content = fs.existsSync(config.envFilePath)
    ? fs.readFileSync(config.envFilePath, 'utf8')
    : '';

  if (/^GOOGLE_REFRESH_TOKEN=/m.test(content)) {
    content = content.replace(
      /^GOOGLE_REFRESH_TOKEN=.*/m,
      `GOOGLE_REFRESH_TOKEN=${refreshToken}`
    );
  } else if (content.length > 0 && !content.endsWith('\n')) {
    content += `\nGOOGLE_REFRESH_TOKEN=${refreshToken}\n`;
  } else {
    content += `GOOGLE_REFRESH_TOKEN=${refreshToken}\n`;
  }

  fs.writeFileSync(config.envFilePath, content, 'utf8');
  process.env.GOOGLE_REFRESH_TOKEN = refreshToken;
  inMemoryRefreshToken = refreshToken;
  console.log(`Saved GOOGLE_REFRESH_TOKEN to ${config.envFilePath}`);
}

async function getAuth() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    const authUrl = getAuthUrl();
    printAuthInstructions(authUrl);
    throw new GoogleAuthRequiredError(authUrl);
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

async function exchangeCodeForTokens(code) {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  console.log('\n========== OAUTH TOKEN EXCHANGE ==========');
  console.log('NEW TOKEN:', tokens.refresh_token);
  console.log('Token keys received:', Object.keys(tokens));
  console.log('==========================================\n');

  if (tokens.refresh_token) {
    inMemoryRefreshToken = tokens.refresh_token;
    printNewRefreshToken(tokens.refresh_token);
    saveRefreshTokenToEnv(tokens.refresh_token);
  } else if (!getRefreshToken()) {
    console.warn(
      'No refresh_token in Google response. Google only sends it on first consent.'
    );
    console.warn(
      'Revoke app access at https://myaccount.google.com/permissions then visit /oauth/start again.'
    );
  } else {
    console.log('Using existing GOOGLE_REFRESH_TOKEN from .env (Google did not send a new one).');
  }

  oauth2Client.setCredentials(tokens);
  return { oauth2Client, tokens };
}

module.exports = {
  getAuth,
  getAuthUrl,
  exchangeCodeForTokens,
};
