require('dotenv').config();

const config = require('./config');
const { runMigrations } = require('./db/migrations/migrate');
const { closeDatabase } = require('./db/connection');

runMigrations();

const app = require('./app');
const { reconcileAllExpenseStatuses } = require('./services/expenseStatus.service');

reconcileAllExpenseStatuses();

const server = app.listen(config.port, () => {
  console.log(`http://localhost:${config.port}`);
  console.log(`OAuth start: http://localhost:${config.port}/oauth/start`);
  console.log('OAuth callback:', config.google.redirectUri);
  console.log('Auth: OAuth2 (refresh token)');
  console.log(`Drive main folder: ${config.google.mainFolderId}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${config.port} is already in use by another process (likely an old server).`);
    console.error('Stop it, then run npm start again.');
    console.error(
      'PowerShell: Get-NetTCPConnection -LocalPort 3000 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }'
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});

function shutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(() => {
    closeDatabase();
    console.log('Server and database connection closed.');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
