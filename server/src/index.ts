import Fastify from 'fastify';

// API skeleton. Later increments add: listing ingestion (3), Claude
// copywriting (4), crop rendering jobs (5), scheduling (6), Content360 push (7).
const app = Fastify({ logger: true });

app.get('/api/health', async () => ({ ok: true }));

const port = Number(process.env.PORT ?? 3001);

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
