import Fastify from 'fastify';
import { registerIngestRoutes } from './ingest/index.js';
import { registerCopywriteRoutes } from './copywrite/index.js';
import { registerCropRoutes } from './crops/index.js';
import { registerScheduleRoutes } from './schedule/index.js';

// API skeleton. Increment 7 adds the Content360 push.
const app = Fastify({ logger: true, bodyLimit: 20_000_000 });

app.get('/api/health', async () => ({ ok: true }));

registerIngestRoutes(app);
registerCopywriteRoutes(app);
registerCropRoutes(app);
registerScheduleRoutes(app);

const port = Number(process.env.PORT ?? 3001);

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
