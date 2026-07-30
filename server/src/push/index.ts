import type { FastifyInstance } from 'fastify';
import {
  isConfigured,
  pushBatch,
  WORKSPACE_ID,
  type OutgoingPost,
  type PushOutcome,
} from './client.js';
import type { Network, PostState } from '../schedule/engine.js';

// Push routes. The batch record lives in memory for now — a database takes
// over when runs persist. Content360 owns publishing and retries; we only
// track the per-post state machine so the dashboard and calendar can show it.

type Batch = {
  id: string;
  runId: string;
  pushedAt: string;
  counts: Record<PostState, number>;
  posts: { localId: string; network: Network; state: PostState; error?: string }[];
};

const batches = new Map<string, Batch>();

function tally(posts: { state: PostState }[]): Record<PostState, number> {
  const counts: Record<PostState, number> = { queued: 0, pushed: 0, published: 0, failed: 0 };
  for (const p of posts) counts[p.state] += 1;
  return counts;
}

type PushBody = {
  runId?: string;
  posts?: OutgoingPost[];
};

export function registerPushRoutes(app: FastifyInstance) {
  // Connection status for the top-bar pill and the Connections screen.
  app.get('/api/content360/status', async () => ({
    ok: true,
    configured: isConfigured(),
    workspaceId: WORKSPACE_ID,
  }));

  app.get('/api/content360/batches', async () => ({
    ok: true,
    batches: [...batches.values()].sort((a, b) => b.pushedAt.localeCompare(a.pushedAt)),
  }));

  app.post<{ Body: PushBody }>('/api/content360/push', async (req, reply) => {
    const runId = (req.body?.runId ?? 'run').slice(0, 64);
    const posts = Array.isArray(req.body?.posts) ? req.body!.posts! : [];

    const result = await pushBatch(posts);

    if (!result.ok) {
      // A blocked or failed push still records what we know, so the sync
      // surfaces tell the truth rather than silently showing nothing.
      if (result.outcomes?.length) {
        const record: Batch = {
          id: `blocked-${Date.now()}`,
          runId,
          pushedAt: new Date().toISOString(),
          counts: tally(result.outcomes.map((o) => ({ state: o.state }))),
          posts: result.outcomes.map((o) => ({
            localId: o.localId,
            network: posts.find((p) => p.localId === o.localId)?.network ?? 'pinterest',
            state: o.state,
            error: o.error,
          })),
        };
        batches.set(record.id, record);
      }
      const status = result.error === 'not_configured' ? 503 : result.error === 'blocked' ? 422 : 502;
      return reply.status(status).send({ ok: false, error: result.error, message: result.message });
    }

    const record: Batch = {
      id: result.batchId,
      runId,
      pushedAt: new Date().toISOString(),
      counts: tally(result.outcomes),
      posts: result.outcomes.map((o: PushOutcome) => ({
        localId: o.localId,
        network: posts.find((p) => p.localId === o.localId)?.network ?? 'pinterest',
        state: o.state,
        error: o.error,
      })),
    };
    batches.set(record.id, record);

    return reply.send({ ok: true, batch: record });
  });

  // Retry failed: re-push only the failed posts of a batch.
  app.post<{ Body: { batchId?: string; posts?: OutgoingPost[] } }>(
    '/api/content360/retry',
    async (req, reply) => {
      const batch = batches.get(req.body?.batchId ?? '');
      if (!batch) {
        return reply.status(404).send({ ok: false, message: 'That batch is no longer on the server.' });
      }
      const failedIds = new Set(batch.posts.filter((p) => p.state === 'failed').map((p) => p.localId));
      const retryable = (req.body?.posts ?? []).filter((p) => failedIds.has(p.localId));
      if (retryable.length === 0) {
        return reply.status(422).send({ ok: false, message: 'Nothing failed in that batch to retry.' });
      }

      const result = await pushBatch(retryable);
      if (!result.ok) {
        const status = result.error === 'not_configured' ? 503 : result.error === 'blocked' ? 422 : 502;
        return reply.status(status).send({ ok: false, error: result.error, message: result.message });
      }

      for (const outcome of result.outcomes) {
        const post = batch.posts.find((p) => p.localId === outcome.localId);
        if (post) {
          post.state = outcome.state;
          post.error = outcome.error;
        }
      }
      batch.counts = tally(batch.posts);
      return reply.send({ ok: true, batch });
    }
  );
}
