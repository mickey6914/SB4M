import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIngestRoutes } from './ingest/index.js';
import { registerCopywriteRoutes } from './copywrite/index.js';
import { registerCropRoutes } from './crops/index.js';
import { registerScheduleRoutes } from './schedule/index.js';
import { registerPushRoutes } from './push/index.js';
import { registerSceneRoutes } from './scenes/index.js';
import { assertPasswordConfigured, registerPasswordGate } from './shared/password-gate.js';

// Refuse to come up unprotected before anything is listening, rather than
// discovering it from a stranger's post on the seller's Pinterest. Printed as
// a plain sentence, not a stack trace: the person who needs to read this is
// looking at a hosting dashboard's log panel, not a debugger.
try {
  assertPasswordConfigured();
} catch (err) {
  console.error(`\n${(err as Error).message}\n`);
  process.exit(1);
}

const app = Fastify({ logger: true, bodyLimit: 20_000_000 });

// First hook wins, so the gate goes on before any route can answer.
registerPasswordGate(app);

app.get('/api/health', async () => ({ ok: true }));

registerIngestRoutes(app);
registerCopywriteRoutes(app);
registerCropRoutes(app);
registerScheduleRoutes(app);
registerPushRoutes(app);
registerSceneRoutes(app);

// — Serving the app itself —
//
// In development the frontend runs on Vite's own server and proxies /api here.
// Deployed, there is one service and one URL: this server also hands out the
// built frontend. Same origin either way, which is why the app's fetches are
// relative and need no base URL setting.
const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, '..', '..', 'web', 'dist');
const indexHtml = path.join(webDist, 'index.html');

if (fs.existsSync(indexHtml)) {
  await app.register(fastifyStatic, { root: webDist });

  // The app routes on the client (/review/:id, /connections, …), so a deep
  // link or a refresh asks this server for a path it has no route for. Hand
  // back the app and let the router sort it out — but only for page requests:
  // an unknown /api/* path is a real 404 and should say so rather than
  // returning HTML that some fetch will then fail to parse as JSON.
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) {
      return reply.code(404).send({ ok: false, message: `No such route: ${req.url}` });
    }
    return reply.sendFile('index.html');
  });
} else {
  app.log.info('No web/dist build found — serving the API only. Run: npm run build');
}

const port = Number(process.env.PORT ?? 3001);

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
