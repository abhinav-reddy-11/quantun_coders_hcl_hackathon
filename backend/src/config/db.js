import pg from 'pg';
import { env } from './env.js';

export const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 10 });

export const query = (text, params) => pool.query(text, params);

/** Runs fn(client) inside BEGIN/COMMIT; rolls back on any error. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
