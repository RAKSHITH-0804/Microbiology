import { env } from './config/env';
import { checkDatabaseConnection, pool } from './config/db';
import { createApp } from './app';

async function start() {
  const app = createApp();

  const dbOk = await checkDatabaseConnection();
  if (!dbOk) {
    console.warn(`Could not connect to PostgreSQL at ${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}. API will start but DB calls will fail.`);
  }

  const server = app.listen(env.PORT, () => {
    console.log(`JJM Microbiology API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
