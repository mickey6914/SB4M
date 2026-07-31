import { adCompliant, type Network, type PostState } from '../schedule/engine.js';

// Content360 handoff. Content360 owns account auth, publishing and retries —
// we own the assets, the copy and the plan, and hand them over post by post.
//
// Content360 is a white-labelled Mixpost instance, and its API is Mixpost's:
// workspace-scoped routes under /os/api/{workspace}, a Bearer token, and a
// post shape built out of "versions" rather than flat fields. The real shape
// was probed against the live workspace on 2026-07-31; findings and the raw
// evidence are written up in DECISIONS.md §8.
//
// Three things drive the design here:
//   1. There is no bulk-create endpoint. A batch is N sequential POSTs.
//   2. Media cannot be referenced by URL. Bytes are uploaded first, and the
//      returned media id is what a post carries.
//   3. The API allows 60 requests per minute, so a 90-post run has to be
//      paced or it starts collecting 429s halfway through.

export const WORKSPACE_ID =
  process.env.CONTENT360_WORKSPACE_ID ?? '34b00c5d-265d-4c55-92b7-ebbc57669d39';

const BASE_URL = process.env.CONTENT360_BASE_URL ?? 'https://app.content360.io/os/api';

// Our network names are the seller's words; Content360's are the provider
// slugs its account records carry. Instagram is `instagram_direct` because
// the workspace publishes through the Instagram API rather than a linked
// Facebook page.
const PROVIDER: Record<Network, string> = {
  pinterest: 'pinterest',
  facebook: 'facebook_page',
  instagram: 'instagram_direct',
};

// Content360's own post statuses, mapped onto our state machine. `draft` means
// we sent it without a schedule; `needs_approval` means it landed but a human
// gate stands between it and publishing — both are "pushed, not yet out".
const STATE: Record<string, PostState> = {
  draft: 'queued',
  scheduled: 'pushed',
  needs_approval: 'pushed',
  published: 'published',
  failed: 'failed',
};

export type OutgoingPost = {
  localId: string;
  network: Network;
  scheduledAt: string; // ISO 8601
  caption: string;
  assetUrl: string; // rendered asset at this network's crop; data: or http(s)
  // Which connected account receives this post. A workspace can hold more
  // than one account on a network, so the choice is the caller's; omitted,
  // we take the first authorized one for the network.
  accountId?: number;
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
  | {
      ok: false;
      error: 'not_configured' | 'blocked' | 'rejected' | 'unreachable';
      message: string;
      outcomes?: PushOutcome[];
    };

export type RemoteAccount = {
  id: number;
  network: Network | null; // null for providers this app doesn't target
  provider: string;
  name: string;
  username: string;
  image: string | null;
  authorized: boolean;
  boards: { id: string; name: string }[]; // Pinterest only; empty elsewhere
};

export function isConfigured(): boolean {
  return Boolean(process.env.CONTENT360_API_KEY);
}

// Workspace rule: #ad is required on every affiliate description, with a hard
// block at push time on anything missing it. This runs before any network
// call so a non-compliant batch never leaves the building.
export function findAdViolations(posts: OutgoingPost[]): string[] {
  return posts.filter((p) => !adCompliant(p.caption)).map((p) => p.localId);
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

function url(path: string): string {
  return `${BASE_URL}/${WORKSPACE_ID}${path}`;
}

async function api(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(url(path), {
    ...init,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${process.env.CONTENT360_API_KEY}`,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    // Laravel returns validation detail as JSON; keep it, it is the only
    // thing that makes a rejected post debuggable.
    const detail = (await res.text().catch(() => '')).slice(0, 400);
    throw new ApiError(res.status, detail || `HTTP ${res.status}`);
  }
  return res.json().catch(() => null);
}

// ── rate limiting ────────────────────────────────────────────────────────
// The API allows 60 requests a minute. We pace at a fixed interval slightly
// slower than that so a long run never trips the limit, and back off on the
// 429 that a shared workspace can still produce.

const MIN_INTERVAL_MS = 1_100; // ~54 requests/minute
let nextSlot = 0;

async function paced<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_INTERVAL_MS;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ApiError && err.status === 429 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 5_000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

// ── accounts ─────────────────────────────────────────────────────────────

function readAccounts(json: unknown): RemoteAccount[] {
  const data =
    json && typeof json === 'object' && Array.isArray((json as Record<string, unknown>).data)
      ? ((json as Record<string, unknown>).data as Record<string, unknown>[])
      : [];
  return data.map((a) => {
    const provider = typeof a.provider === 'string' ? a.provider : '';
    const network = (Object.keys(PROVIDER) as Network[]).find((n) => PROVIDER[n] === provider);
    // Pinterest boards ride along on the account record, so "refresh boards"
    // is just re-reading this endpoint — there is no separate boards route.
    const rel = (a.data as Record<string, unknown> | null)?.relationships as
      | Record<string, unknown>
      | undefined;
    const boards = Array.isArray(rel?.boards)
      ? (rel!.boards as Record<string, unknown>[])
          .filter((b) => typeof b.id === 'string' && typeof b.name === 'string')
          .map((b) => ({ id: b.id as string, name: b.name as string }))
      : [];
    return {
      id: Number(a.id),
      network: network ?? null,
      provider,
      name: typeof a.name === 'string' ? a.name : '',
      username: typeof a.username === 'string' ? a.username : '',
      image: typeof a.image === 'string' ? a.image : null,
      authorized: a.authorized === true,
      boards,
    };
  });
}

export async function fetchAccounts(): Promise<RemoteAccount[]> {
  return readAccounts(await paced(() => api('/accounts')));
}

// ── media ────────────────────────────────────────────────────────────────

async function assetBytes(assetUrl: string): Promise<{ bytes: Buffer; mime: string }> {
  if (assetUrl.startsWith('data:')) {
    const comma = assetUrl.indexOf(',');
    const mime = /^data:([^;,]+)/.exec(assetUrl)?.[1] ?? 'image/png';
    if (comma < 0) throw new Error('malformed data URL');
    return { bytes: Buffer.from(assetUrl.slice(comma + 1), 'base64'), mime };
  }
  const res = await fetch(assetUrl, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`could not read the rendered asset (HTTP ${res.status})`);
  const mime = res.headers.get('content-type')?.split(';')[0] ?? 'image/png';
  return { bytes: Buffer.from(await res.arrayBuffer()), mime };
}

// Uploads happen once per distinct asset — a pin fanned out to two networks
// that share a crop is one upload, not two.
export async function uploadMedia(assetUrl: string, filename: string): Promise<string> {
  const { bytes, mime } = await assetBytes(assetUrl);
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type: mime }), filename);
  const json = await paced(() => api('/media', { method: 'POST', body: form }));
  const id = (json as Record<string, unknown> | null)?.id;
  if (typeof id !== 'string' && typeof id !== 'number') {
    throw new Error('Content360 accepted the upload but returned no media id.');
  }
  return String(id);
}

// ── posts ────────────────────────────────────────────────────────────────

// The body is stored as HTML — the composer is a rich-text field, and markup
// we send is kept verbatim rather than escaped. So escape it ourselves, or an
// ampersand or a "<3" in a caption arrives as markup and is lost on publish.
// Newlines are left alone: Content360 turns them into the same block elements
// its own composer produces, and pre-wrapping them only nests a level deeper.
export function captionToBody(caption: string): string {
  return caption.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildPostBody(post: OutgoingPost, accountId: number, mediaId: string) {
  const at = new Date(post.scheduledAt);
  const options: Record<string, unknown> = {};

  if (post.network === 'pinterest') {
    options.pinterest = {
      title: post.pinterest?.title ?? '',
      link: post.pinterest?.link ?? '',
      // Boards are keyed per account, not per post — the picker in the
      // scheduling screen fills this in once a board is chosen.
      boards: { [`account-${accountId}`]: post.pinterest?.board ?? null },
    };
  }
  if (post.network === 'facebook') {
    options.facebook_page = { type: post.facebook?.postType ?? 'post' };
  }
  if (post.network === 'instagram') {
    options.instagram = { type: 'post' };
  }

  return {
    accounts: [accountId],
    // Times are computed in UTC upstream, so hand them over as UTC rather
    // than re-deriving a local wall clock the scheduler never meant.
    date: at.toISOString().slice(0, 10),
    time: at.toISOString().slice(11, 16),
    timezone: 'UTC',
    schedule: true,
    versions: [
      {
        account_id: 0,
        is_original: true,
        content: [{ body: captionToBody(post.caption), media: [mediaId] }],
        options,
      },
    ],
  };
}

function readPostStatus(json: unknown): { uuid?: string; state: PostState; error?: string } {
  const rec = (json ?? {}) as Record<string, unknown>;
  const uuid = typeof rec.uuid === 'string' ? rec.uuid : undefined;
  const status = typeof rec.status === 'string' ? rec.status : '';
  // Per-account publishing errors are the only place a failure reason shows
  // up once Content360 has taken the post.
  const errors = Array.isArray(rec.accounts)
    ? (rec.accounts as Record<string, unknown>[]).flatMap((a) =>
        Array.isArray(a.errors) ? a.errors.map((e) => String(e)) : []
      )
    : [];
  return {
    uuid,
    state: STATE[status] ?? 'pushed',
    error: errors.length > 0 ? errors.join('; ') : undefined,
  };
}

// ── the batch ────────────────────────────────────────────────────────────

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

  // One account lookup for the whole batch. Without it we cannot address a
  // single post, so a failure here fails the batch rather than each post.
  let accounts: RemoteAccount[];
  try {
    accounts = await fetchAccounts();
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 0;
    if (status === 401 || status === 403) {
      return {
        ok: false,
        error: 'rejected',
        message: 'Content360 refused the API key. Check CONTENT360_API_KEY and the workspace id.',
      };
    }
    return {
      ok: false,
      error: 'unreachable',
      message: 'Could not reach Content360 — the batch was not pushed. Nothing was lost; try again.',
    };
  }

  const byNetwork = new Map<Network, RemoteAccount>();
  for (const a of accounts) {
    if (a.network && a.authorized && !byNetwork.has(a.network)) byNetwork.set(a.network, a);
  }

  // Some networks missing is a per-post failure; all of them missing means
  // there is nothing to push at all, and that is worth saying up front.
  const wanted = [...new Set(posts.map((p) => p.network))];
  const missing = wanted.filter((n) => !byNetwork.has(n));
  if (missing.length === wanted.length) {
    return {
      ok: false,
      error: 'rejected',
      message: `No connected Content360 account for ${missing.join(', ')}. Connect the account in Content360, then push again.`,
    };
  }

  // Distinct assets upload once and are shared by every post that uses them.
  const mediaByAsset = new Map<string, Promise<string>>();
  const outcomes: PushOutcome[] = [];

  for (const post of posts) {
    // A named account is honoured exactly, or the post fails. Quietly falling
    // back to a different account would publish to the wrong Instagram — the
    // precise surprise the picker exists to remove.
    const account = post.accountId
      ? (accounts.find((a) => a.id === post.accountId && a.network === post.network) ?? null)
      : (byNetwork.get(post.network) ?? null);

    if (!account) {
      outcomes.push({
        localId: post.localId,
        state: 'failed',
        error: post.accountId
          ? `The chosen ${post.network} account is no longer connected in Content360. Pick another in Connections.`
          : `No connected ${post.network} account in Content360.`,
      });
      continue;
    }
    if (!account.authorized) {
      outcomes.push({
        localId: post.localId,
        state: 'failed',
        error: `The ${post.network} account "${account.username}" needs reconnecting in Content360.`,
      });
      continue;
    }

    try {
      if (!post.assetUrl) throw new Error('This pin has no rendered asset to push.');
      let mediaId = mediaByAsset.get(post.assetUrl);
      if (!mediaId) {
        mediaId = uploadMedia(post.assetUrl, `${post.localId.replace(/[^\w.-]+/g, '-')}.png`);
        mediaByAsset.set(post.assetUrl, mediaId);
      }

      const body = buildPostBody(post, account.id, await mediaId);
      const json = await paced(() =>
        api('/posts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      );
      const read = readPostStatus(json);
      outcomes.push({
        localId: post.localId,
        state: read.state,
        remoteId: read.uuid,
        error: read.error,
      });
    } catch (err) {
      // One bad post does not sink the batch — the rest still go, and the
      // sync surface shows exactly which ones need a retry. A failed upload
      // stays cached as a failure too, so a broken asset is reported once per
      // post rather than re-uploaded for each.
      outcomes.push({
        localId: post.localId,
        state: 'failed',
        error:
          err instanceof ApiError
            ? `Content360 rejected this post (${err.status}). ${err.message}`
            : err instanceof Error
              ? err.message
              : String(err),
      });
    }
  }

  return { ok: true, batchId: `batch-${Date.now()}`, outcomes };
}

// Re-read the current state of posts we have already handed over, so the
// dashboard and calendar can move them from pushed to published (or failed)
// without the seller opening Content360.
export async function fetchStates(
  remoteIds: string[]
): Promise<Record<string, { state: PostState; error?: string }>> {
  const out: Record<string, { state: PostState; error?: string }> = {};
  for (const id of remoteIds) {
    try {
      const json = await paced(() => api(`/posts/${encodeURIComponent(id)}`));
      const read = readPostStatus(json);
      out[id] = { state: read.state, error: read.error };
    } catch (err) {
      // A post deleted in Content360 is gone, not failed — leave it alone
      // rather than inventing a state for it.
      if (err instanceof ApiError && err.status === 404) continue;
      throw err;
    }
  }
  return out;
}
