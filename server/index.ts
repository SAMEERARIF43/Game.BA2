import path from 'node:path';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import cors from 'cors';
import express from 'express';
import { getPublicRoomSummary, MatchRoom } from './rooms/MatchRoom.ts';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

export async function startServer(): Promise<void> {
  const gameServer = new Server({
    transport: new WebSocketTransport({
      pingInterval: 10000,
      pingMaxRetries: 3,
    }),
    express: async (app) => {
      app.use(cors());
      app.use(express.json());

      app.get('/api/health', (_req, res) => {
        res.json({ ok: true, mode: IS_PROD ? 'production' : 'development' });
      });

      app.get('/api/rooms/:code', (req, res) => {
        const code = String(req.params.code || '').trim().toUpperCase();
        if (!/^[A-Z0-9]{6}$/.test(code)) {
          res.status(400).json({ found: false, error: 'Room code must be 6 characters.' });
          return;
        }

        const summary = getPublicRoomSummary(code);
        if (!summary) {
          res.status(404).json({ found: false, error: 'Room not found or has closed.' });
          return;
        }

        res.json({ found: true, room: summary });
      });

      if (!IS_PROD) {
        const { createServer: createViteServer } = await import('vite');
        const vite = await createViteServer({
          server: {
            middlewareMode: true,
            hmr: process.env.DISABLE_HMR !== 'true',
          },
          appType: 'spa',
        });

        app.use((req, res, next) => {
          if (req.path.startsWith('/matchmake') || req.path.startsWith('/api')) {
            next();
            return;
          }
          vite.middlewares(req, res, next);
        });
      } else {
        const distDir = path.resolve(import.meta.dirname, '..', 'dist');
        app.use(express.static(distDir));
        app.use((req, res, next) => {
          if (req.path.startsWith('/matchmake') || req.path.startsWith('/api')) {
            next();
            return;
          }
          res.sendFile(path.join(distDir, 'index.html'));
        });
      }
    },
  });

  gameServer.define('match', MatchRoom);

  await gameServer.listen(PORT, '0.0.0.0');
  console.log(`[Strike Force] Colyseus & Web Server listening on http://0.0.0.0:${PORT}`);
}

startServer().catch((err) => {
  console.error('[Strike Force] Failed to start server:', err);
  process.exit(1);
});
