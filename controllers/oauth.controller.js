const config = require('../config');
const ValidationError = require('../errors/ValidationError');
const { getAuthUrl, exchangeCodeForTokens } = require('../services/google/auth.service');

function renderOAuthSuccessHtml(savedToEnv) {
  return (
    '<html lang="he" dir="rtl"><body style="font-family:sans-serif;padding:2rem">' +
    '<h1>ההרשאה הצליחה</h1>' +
    (savedToEnv
      ? '<p><code>GOOGLE_REFRESH_TOKEN</code> נשמר ב-<code>.env</code> והודפס במסוף השרת.</p>'
      : '<p>Google לא החזיר refresh token חדש. בטל גישה לאפליקציה ב-' +
        '<a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">הרשאות Google</a> ' +
        'ונסה שוב ב-<a href="/oauth/start">/oauth/start</a>.</p>') +
    '<p><a href="/">חזרה לאפליקציה</a></p>' +
    '</body></html>'
  );
}

async function startOAuth(req, res) {
  const authUrl = getAuthUrl();

  console.log('\n========== GOOGLE OAUTH START ==========');
  console.log('Redirecting browser to Google login...');
  console.log('Auth URL:', authUrl);
  console.log('Redirect URI (must match Google Cloud Console):', config.google.redirectUri);
  console.log('=========================================\n');

  res.redirect(302, authUrl);
}

async function handleOAuthCallback(req, res) {
  if (req.query.error) {
    const message = req.query.error_description || req.query.error;
    console.error('\n========== OAUTH CALLBACK ERROR ==========');
    console.error(message);
    console.error('Redirect URI expected:', config.google.redirectUri);
    console.error(
      'Add this URI in Google Cloud Console → OAuth client → Authorized redirect URIs'
    );
    console.error('==========================================\n');
    throw new ValidationError(`Google OAuth error: ${message}`);
  }

  const code = req.query.code;
  if (!code) {
    throw new ValidationError('Missing authorization code.');
  }

  console.log('\n========== OAUTH CALLBACK RECEIVED ==========');
  console.log('Exchanging authorization code for tokens...');

  const { tokens } = await exchangeCodeForTokens(code);

  const savedToEnv = Boolean(tokens.refresh_token);
  console.log('Token exchange complete.');
  if (savedToEnv) {
    console.log('GOOGLE_REFRESH_TOKEN was written to .env — no restart needed for this session.');
  } else {
    console.log('No new refresh token to save. See warnings above.');
  }
  console.log('=============================================\n');

  res.status(200).send(renderOAuthSuccessHtml(savedToEnv));
}

module.exports = {
  startOAuth,
  handleOAuthCallback,
};
