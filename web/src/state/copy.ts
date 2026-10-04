import type { WorkspaceRules } from './workspace';
import type { RunCopyResult } from './posts';

// One call to /api/copywrite: the hero image plus the workspace's prompt and
// product type. Used by the Generating step for the whole run, and by
// "Rewrite with AI" for the selected pin. Never throws — a failure comes back
// as a message to show.

export type CopyRequest = {
  image?: string;
  product?: string;
  mockup: string;
  scenes: string[];
  styleDirection: string;
  rules: Pick<WorkspaceRules, 'copyPrompt' | 'productType'>;
};

export type CopyResponse = { ok: true; copy: RunCopyResult } | { ok: false; message: string };

const FAILURE = "Copy didn't come back. Click Rewrite with AI to try again.";

export async function requestCopy(req: CopyRequest): Promise<CopyResponse> {
  try {
    const res = await fetch('/api/copywrite', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        image: req.image,
        product: req.product || undefined,
        mockup: req.mockup,
        scenes: req.scenes,
        styleDirection: req.styleDirection || undefined,
        prompt: req.rules.copyPrompt,
        productType: req.rules.productType,
      }),
    });
    const json = await res.json();
    if (json.ok && json.copy) return { ok: true, copy: json.copy };
    return { ok: false, message: json.message ?? FAILURE };
  } catch {
    return { ok: false, message: 'Could not reach the server to write the copy. ' + FAILURE };
  }
}
