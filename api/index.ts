import express from 'express';
import cookieParser from 'cookie-parser';
import { apiRouter } from '../src/server/api.js';
import { ensureDbInitialized } from '../src/server/db.js';

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

// Ensure database is initialized before handling any serverless request
app.use('/api', async (_req, res, next) => {
  try {
    await ensureDbInitialized();
    next();
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Database initialization error' });
  }
});

// Mount API router
app.use('/api', apiRouter);

// Export for Vercel Serverless
export default app;
