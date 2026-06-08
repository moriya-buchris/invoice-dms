const AppError = require('./AppError');

class ConflictError extends AppError {
  constructor(message, code = 'CONFLICT') {
    super(message, 409, code);
    this.name = 'ConflictError';
  }
}

module.exports = ConflictError;
