import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { pool } from './config/db.js';
import { errorHandler, notFound } from './middleware/errors.js';
import routes from './routes/index.js';

const app = express();
app.use(cors({ origin: env.corsOrigin.split(',').map((s) => s.trim()) }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (req, res) => {
  const check = async (url) => {
    try {
      const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
      return r.ok ? await r.json() : { status: 'error', http: r.status };
    } catch {
      return { status: 'unreachable' };
    }
  };
  let database = 'ok';
  try {
    await pool.query('SELECT 1');
  } catch {
    database = 'unreachable';
  }
  const [ml, rag] = await Promise.all([check(env.mlServiceUrl), check(env.ragServiceUrl)]);
  res.json({ data: { backend: 'ok', database, ml, rag } });
});

app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

export default app;
