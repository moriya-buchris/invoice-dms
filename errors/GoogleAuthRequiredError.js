const AppError = require('./AppError');

class GoogleAuthRequiredError extends AppError {
  constructor(authUrl) {
    super('Google authentication required.', 401, 'GOOGLE_AUTH_REQUIRED');
    this.name = 'GoogleAuthRequiredError';
    this.authUrl = authUrl;
  }
}

module.exports = GoogleAuthRequiredError;
