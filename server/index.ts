import path from 'node:path';
import { matchMaker, Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import cors from 'cors';
import express from 'express';
import { getAllPublicRooms, getPublicRoomSummary, MatchRoom } from './rooms/MatchRoom.ts';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const DEFAULT_DEV_CLIENT_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

function getClientOrigins(): Set<string> {
  const configuredOrigins = [
    ...(process.env.CLIENT_ORIGIN ?? '').split(','),
    process.env.APP_URL ?? '',
    process.env.SHARED_APP_URL ?? '',
  ]
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origins = new Set(
    IS_PROD ? configuredOrigins : [...DEFAULT_DEV_CLIENT_ORIGINS, ...configuredOrigins]
  );

  if (IS_PROD && origins.size === 0) {
    console.warn('[Strike Force] CLIENT_ORIGIN not set; allowing same-origin requests only.');
  }

  for (const origin of origins) {
    let parsedOrigin: URL;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      throw new Error(`CLIENT_ORIGIN contains an invalid URL origin: "${origin}".`);
    }
    if (
      parsedOrigin.origin !== origin ||
      (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:')
    ) {
      throw new Error(`CLIENT_ORIGIN must contain origins without paths: "${origin}".`);
    }
  }

  return origins;
}

function isOriginAllowed(
  origin: string | null | undefined,
  hostHeader: string | null | undefined,
  clientOrigins: Set<string>
): boolean {
  if (!origin) return false;
  if (clientOrigins.has(origin)) return true;
  if (!hostHeader) return false;

  try {
    const parsedOrigin = new URL(origin);
    const requestHost = hostHeader.split(',')[0].trim();
    return Boolean(requestHost && parsedOrigin.host === requestHost);
  } catch {
    return false;
  }
}

export async function startServer(): Promise<void> {
  const clientOrigins = getClientOrigins();
  matchMaker.controller.getCorsHeaders = (headers) => {
    const origin = headers.get('origin');
    const hostHeader = headers.get('x-forwarded-host') || headers.get('host');
    return {
      'Access-Control-Allow-Origin': isOriginAllowed(origin, hostHeader, clientOrigins)
        ? (origin as string)
        : '',
    };
  };

  const gameServer = new Server({
    transport: new WebSocketTransport({
      pingInterval: 10000,
      pingMaxRetries: 3,
    }),
    express: async (app) => {
      app.set('trust proxy', 1);
      app.use((req, res, next) => {
        const origin = req.headers.origin;
        const hostHeader =
          (typeof req.headers['x-forwarded-host'] === 'string'
            ? req.headers['x-forwarded-host']
            : undefined) || req.headers.host;
        if (origin && !isOriginAllowed(origin, hostHeader, clientOrigins)) {
          res.removeHeader('Access-Control-Allow-Origin');
          res.removeHeader('Access-Control-Allow-Credentials');
        }
        next();
      });
      app.use((req, res, next) => {
        const hostHeader =
          (typeof req.headers['x-forwarded-host'] === 'string'
            ? req.headers['x-forwarded-host']
            : undefined) || req.headers.host;
        cors({
          origin(origin, callback) {
            callback(null, isOriginAllowed(origin, hostHeader, clientOrigins));
          },
        })(req, res, next);
      });
      app.use(express.json());

      app.get('/api/health', (_req, res) => {
        res.json({ ok: true, mode: IS_PROD ? 'production' : 'development' });
      });

      app.get('/api/rooms', (_req, res) => {
        res.json({ rooms: getAllPublicRooms() });
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
