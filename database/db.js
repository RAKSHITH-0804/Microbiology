const path = require('path');
const { Client } = require('pg');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

function createClient() {
  return new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
}

module.exports = { createClient };
