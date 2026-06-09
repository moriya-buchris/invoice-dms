const AppError = require('./AppError');

class NotFoundError extends AppError {
  constructor(message = 'ההוצאה לא נמצאה.') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

module.exports = NotFoundError;
