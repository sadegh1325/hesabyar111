import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import { apiRouter } from '../src/server/api.js';
import { initDatabase, syncTursoDatabase } from '../src/server/db.js';

const app = express();

// Initialize DB tables and seed admin user
initDatabase();
syncTursoDatabase().catch(() => {});

app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

// Mount API router
app.use('/api', apiRouter);

// Export for Vercel Serverless
export default app;
