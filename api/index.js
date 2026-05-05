import { app, ensureServerReady } from '../server/index.js';

export default async function handler(req, res) {
  await ensureServerReady();

  if (!req.url.startsWith('/api')) {
    req.url = `/api${req.url}`;
  }

  return app(req, res);
}
