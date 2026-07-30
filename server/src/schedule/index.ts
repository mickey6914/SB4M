import type { FastifyInstance } from 'fastify';
import { DEFAULT_RULES, scheduleRun, type FanOut, type WorkspaceRules } from './engine.js';

// Schedule route: computes a run's posting plan under the workspace rules.
// Stateless for now — the client holds the plan; a database takes over when
// runs persist (increment 7+).

type ScheduleBody = {
  productId?: string;
  productTitle?: string;
  pinCount?: number;
  fanOut?: string;
  startDate?: string;
  rules?: Partial<WorkspaceRules>;
};

// Workspace rules come from the Connections screen. Values are clamped so a
// stray edit can't produce an impossible window or an unbounded day.
function readRules(patch: Partial<WorkspaceRules> | undefined): WorkspaceRules {
  if (!patch) return DEFAULT_RULES;
  const clamp = (n: unknown, lo: number, hi: number, fallback: number) =>
    Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n as number))) : fallback;
  const windowStart = clamp(patch.windowStart, 0, 23, DEFAULT_RULES.windowStart);
  const windowEnd = clamp(patch.windowEnd, 0, 23, DEFAULT_RULES.windowEnd);
  return {
    windowStart: Math.min(windowStart, windowEnd),
    windowEnd: Math.max(windowStart, windowEnd),
    maxPerNetworkPerDay: clamp(patch.maxPerNetworkPerDay, 1, 12, DEFAULT_RULES.maxPerNetworkPerDay),
  };
}

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

    const rules = readRules(b.rules);
    try {
      const posts = scheduleRun({
        productId: (b.productId ?? 'product').slice(0, 200),
        productTitle: (b.productTitle ?? 'Product').slice(0, 200),
        pinCount,
        fanOut,
        startDate,
        rules,
      });
      return reply.send({ ok: true, posts, rules });
    } catch {
      // A window narrower than the network slots leaves nowhere valid to post.
      return reply.status(422).send({
        ok: false,
        message:
          'No posting slots fit inside that window — widen it in Connections (the networks post at 09:00, 11:00 and 13:00).',
      });
    }
  });
}
