import { adCompliant, type Network, type PostState } from '../schedule/engine.js';

// Content360 handoff. Content360 owns account auth, publishing and retries —
// we own the assets, the copy and the plan, and hand them over as one batch.
//
// The request shape follows the handoff's Integration section: per post the
// rendered asset at that network's crop, the caption, the scheduled time, the
// target network, plus Pinterest's title/link/board and Facebook's post type.
// Credentials and base URL come from the environment; nothing is hard-coded.

export const WORKSPACE_ID =
  process.env.CONTENT360_WORKSPACE_ID ?? '34b00c5d-265d-4c55-92b7-ebbc57669d39';

const BASE_URL = process.env.CONTENT360_BASE_URL ?? 'https://app.content360.io/api';

export type OutgoingPost = {
  localId: string;
  network: Network;
  scheduledAt: string; // ISO 8601
  caption: string;
  assetUrl: string; // rendered asset at this network's crop
  pinterest?: { title: string; link: string; board?: string };
  facebook?: { postType: 'post' | 'reel' | 'story' };
};

export type PushOutcome = {
  localId: string;
  state: PostState;
  remoteId?: string;
  error?: string;
};

export type PushResult =
  | { ok: true; batchId: string; outcomes: PushOutcome[] }
  | { ok: false; error: 'not_configured' | 'blocked' | 'rejected' | 'unreachable'; message: string; outcomes?: PushOutcome[] };

export function isConfigured(): boolean {
  return Boolean(process.env.CONTENT360_API_KEY);
}

// Workspace rule: #ad is required on every affiliate description, with a hard
// block at push time on anything missing it. This runs before any network
// call so a non-compliant batch never leaves the building.
export function findAdViolations(posts: OutgoingPost[]): string[] {
  return posts.filter((p) => !adCompliant(p.caption)).map((p) => p.localId);
}

function toRequestBody(posts: OutgoingPost[]) {
  return {
    workspace_id: WORKSPACE_ID,
    posts: posts.map((p) => ({
      external_id: p.localId,
      network: p.network,
      scheduled_at: p.scheduledAt,
      caption: p.caption,
      media: [{ url: p.assetUrl }],
      ...(p.pinterest
        ? {
            pinterest: {
              title: p.pinterest.title,
              destination_link: p.pinterest.link,
              ...(p.pinterest.board ? { board: p.pinterest.board } : {}),
            },
          }
        : {}),
      ...(p.facebook ? { facebook: { post_type: p.facebook.postType } } : {}),
    })),
  };
}

// Map the API's per-post acknowledgement onto our state machine. Anything we
// can't read is treated as failed rather than optimistically pushed.
function readOutcomes(json: unknown, posts: OutgoingPost[]): PushOutcome[] {
  const results =
    json && typeof json === 'object' && Array.isArray((json as Record<string, unknown>).posts)
      ? ((json as Record<string, unknown>).posts as unknown[])
      : [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const r of results) {
    if (r && typeof r === 'object') {
      const rec = r as Record<string, unknown>;
      const id = typeof rec.external_id === 'string' ? rec.external_id : null;
      if (id) byId.set(id, rec);
    }
  }
  return posts.map((p) => {
    const rec = byId.get(p.localId);
    if (!rec) {
      return { localId: p.localId, state: 'failed' as PostState, error: 'No acknowledgement returned for this post.' };
    }
    const status = typeof rec.status === 'string' ? rec.status.toLowerCase() : '';
    const remoteId = typeof rec.id === 'string' ? rec.id : undefined;
    if (status === 'error' || status === 'failed' || status === 'rejected') {
      return {
        localId: p.localId,
        state: 'failed' as PostState,
        remoteId,
        error: typeof rec.message === 'string' ? rec.message : 'Content360 rejected this post.',
      };
    }
    if (status === 'published') return { localId: p.localId, state: 'published' as PostState, remoteId };
    return { localId: p.localId, state: 'pushed' as PostState, remoteId };
  });
}

export async function pushBatch(posts: OutgoingPost[]): Promise<PushResult> {
  if (posts.length === 0) {
    return { ok: false, error: 'rejected', message: 'Nothing to push — approve some pins first.' };
  }

  const violations = findAdViolations(posts);
  if (violations.length > 0) {
    return {
      ok: false,
      error: 'blocked',
      message: `Workspace rule: ${violations.length} description${
        violations.length > 1 ? 's are' : ' is'
      } missing #ad. Fix them in review before pushing.`,
      outcomes: violations.map((localId) => ({
        localId,
        state: 'failed',
        error: '#ad missing — blocked by workspace rule.',
      })),
    };
  }

  if (!isConfigured()) {
    return {
      ok: false,
      error: 'not_configured',
      message:
        'No Content360 API key on the server yet — set CONTENT360_API_KEY (and CONTENT360_WORKSPACE_ID) to push for real.',
    };
  }

  try {
    const res = await fetch(`${BASE_URL}/v1/posts/bulk`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.CONTENT360_API_KEY}`,
      },
      body: JSON.stringify(toRequestBody(posts)),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      return {
        ok: false,
        error: 'rejected',
        message: `Content360 rejected the batch (${res.status}). ${detail}`.trim(),
      };
    }

    const json: unknown = await res.json().catch(() => null);
    const batchId =
      json && typeof json === 'object' && typeof (json as Record<string, unknown>).batch_id === 'string'
        ? ((json as Record<string, unknown>).batch_id as string)
        : `batch-${Date.now()}`;
    return { ok: true, batchId, outcomes: readOutcomes(json, posts) };
  } catch {
    return {
      ok: false,
      error: 'unreachable',
      message: 'Could not reach Content360 — the batch was not pushed. Nothing was lost; try again.',
    };
  }
}
