import type { FastifyInstance } from 'fastify';
import { scheduleRun, type FanOut } from './engine.js';

// Schedule route: computes a run's posting plan under the workspace rules.
// Stateless for now — the client holds the plan; a database takes over when
// runs persist (increment 7+).

type ScheduleBody = {
  productId?: string;
  productTitle?: string;
  pinCount?: number;
  fanOut?: string;
  startDate?: string;
};

const FAN_OUTS = new Set(['pinterest', 'pinterest_facebook', 'all']);

export function registerScheduleRoutes(app: FastifyInstance) {
  app.post<{ Body: ScheduleBody }>('/api/schedule', async (req, reply) => {
    const b = req.body ?? {};
    const pinCount = Number(b.pinCount);
    if (!Number.isInteger(pinCount) || pinCount < 1 || pinCount > 60) {
      return reply.status(422).send({ ok: false, message: 'Nothing to schedule yet.' });
    }
    const fanOut: FanOut = FAN_OUTS.has(b.fanOut ?? '') ? (b.fanOut as FanOut) : 'all';
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(b.startDate ?? '')
      ? b.startDate!
      : new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

    const posts = scheduleRun({
      productId: (b.productId ?? 'product').slice(0, 200),
      productTitle: (b.productTitle ?? 'Product').slice(0, 200),
      pinCount,
      fanOut,
      startDate,
    });
    return reply.send({ ok: true, posts });
  });
}
