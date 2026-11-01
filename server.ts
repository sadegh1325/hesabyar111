import http from 'http';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { apiRouter } from './src/server/api.js';
import { initDatabase } from './src/server/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Gracefully handle any WebSocket connection from Vite client to prevent "WebSocket closed without opened"
  const wss = new WebSocketServer({ server: httpServer });
  wss.on('connection', (ws) => {
    try {
      ws.send(JSON.stringify({ type: 'connected' }));
    } catch {}
    ws.on('message', () => {});
    ws.on('error', () => {});
  });

  // Initialize DB tables and seed admin user
  initDatabase();

  app.use(express.json({ limit: '50mb' }));
  app.use(cookieParser());

  // Mount API router
  app.use('/api', apiRouter);

  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Hesabyar Store Accounting Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
