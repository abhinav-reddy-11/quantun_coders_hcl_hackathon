import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../../.env') }); // repo-root .env
dotenv.config(); // backend/.env (optional override)

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name} (see .env.example)`);
  return v;
}

export const env = {
  port: Number(process.env.BACKEND_PORT || 4000),
  databaseUrl: required('DATABASE_URL'),
  mlServiceUrl: (process.env.ML_SERVICE_URL || 'http://localhost:8001').replace(/\/$/, ''),
  ragServiceUrl: (process.env.RAG_SERVICE_URL || 'http://localhost:8002').replace(/\/$/, ''),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173',
  serviceTimeoutMs: Number(process.env.SERVICE_TIMEOUT_MS || 120000),
};
