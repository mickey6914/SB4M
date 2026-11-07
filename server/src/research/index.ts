import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { analyze } from './analyze.js';
import { importReport, parseFindings } from './imported.js';
import { NICHE_DEFAULTS } from './lexicon.js';
import { buildPrompts, NICHE_SPECS, ruleIdeas } from './prompts.js';
import { collect, sourceConfig, SOURCE_LABELS, type ResearchInput } from './sources.js';
import { hasClaude, synthesize } from './synthesize.js';
import { NICHES, SOURCE_IDS, type CollectedSourceId, type Niche, type PaletteColor, type ResearchReport } from './types.js';

// Trend Research: what to make next. Collects demand signals for a niche from
// search engines and marketplaces, ranks them, and turns them into product
// ideas with image-generation prompts and Etsy listing copy. The ideas feed
// straight into a Pin-Post Studio run once the art exists.

type RunBody = {
  niche?: string;
  seeds?: unknown;
  sources?: unknown;
  shopifyStores?: unknown;
  region?: string;
  webSearch?: boolean;
  findings?: unknown;
};

// Pasted findings: enough for a long Claude in Chrome or ProfitTree answer.
const FINDINGS_MAX = 30_000;

// Reports are cached briefly: the same question asked twice in a few minutes
// should not spend API quota twice. Keyed on everything that changes the answer.
const CACHE_MS = 30 * 60_000;
const cache = new Map<string, { at: number; report: ResearchReport }>();

function stringList(v: unknown, max: number, len: number): string[] {
  if (!Array.isArray(v)) return [];
  return [
    ...new Set(
      v
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.replace(/\s+/g, ' ').trim().slice(0, len))
        .filter(Boolean)
    ),
  ].slice(0, max);
}

export function parseRunBody(
  body: RunBody
): (ResearchInput & { webSearch: boolean; findings: string }) | { error: string } {
  const niche = (NICHES as readonly string[]).includes(body.niche ?? '') ? (body.niche as Niche) : null;
  if (!niche) return { error: 'Pick a niche: clipart, wall art or home decor.' };
  const seeds = stringList(body.seeds, 6, 60);
  const sources = stringList(body.sources, SOURCE_IDS.length, 20).filter((s): s is CollectedSourceId =>
    (SOURCE_IDS as readonly string[]).includes(s)
  );
  const findings = typeof body.findings === 'string' ? body.findings.slice(0, FINDINGS_MAX) : '';
  // No sources ticked but findings pasted: a report from the paste alone.
  // Otherwise an empty or missing list means "all sources".
  const pasteOnly = Array.isArray(body.sources) && sources.length === 0 && findings.trim() !== '';
  const region = typeof body.region === 'string' && /^[a-z]{2}$/i.test(body.region) ? body.region.toUpperCase() : 'US';
  return {
    niche,
    seeds: seeds.length ? seeds : NICHE_DEFAULTS[niche].seeds,
    sources: sources.length || pasteOnly ? sources : [...SOURCE_IDS],
    shopifyStores: stringList(body.shopifyStores, 8, 120),
    region,
    webSearch: sources.length ? sources.includes('web') : !pasteOnly,
    findings,
  };
}

export function registerResearchRoutes(app: FastifyInstance) {
  app.get('/api/research/status', async () => {
    const config = sourceConfig();
    return {
      ok: true,
      claude: hasClaude(),
      niches: NICHES.map((n) => ({ id: n, label: NICHE_DEFAULTS[n].label, seeds: NICHE_DEFAULTS[n].seeds })),
      sources: SOURCE_IDS.map((id) => ({ id, label: SOURCE_LABELS[id], ...config[id] })),
    };
  });

  app.post<{ Body: RunBody }>('/api/research/run', async (req, reply) => {
    const input = parseRunBody(req.body ?? {});
    if ('error' in input) return reply.status(400).send({ ok: false, message: input.error });

    const key = JSON.stringify([
      input.niche,
      input.seeds,
      [...input.sources].sort(),
      input.shopifyStores,
      input.region,
      input.findings.trim(),
    ]);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return reply.send({ ok: true, report: hit.report, cached: true });

    const reports = await collect(input);
    if (input.findings.trim()) reports.push(importReport(parseFindings(input.findings)));
    const analysis = analyze(reports, input.seeds);

    const webWanted = input.webSearch && hasClaude();
    if (analysis.signalCount === 0 && !webWanted) {
      return reply.status(502).send({
        ok: false,
        message:
          'No source returned any data. If every source failed, the server may not have internet access to them — the per-source notes say why.',
        sources: reports.map(({ signals: _s, ...r }) => r),
      });
    }

    const result = await synthesize({
      niche: input.niche,
      seeds: input.seeds,
      reports,
      analysis,
      webSearch: input.webSearch,
      log: req.log,
    });

    const sources = reports.map(({ signals: _s, ...r }) => r);
    if (input.sources.includes('web')) {
      sources.push({
        source: 'web',
        label: SOURCE_LABELS.web,
        status: !hasClaude() ? 'not_configured' : result.ok ? 'ok' : 'failed',
        message: !hasClaude()
          ? 'Needs an Anthropic key.'
          : result.ok
            ? `${result.webSources.length} articles consulted`
            : result.message,
      });
    }

    const report: ResearchReport = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      niche: input.niche,
      seeds: input.seeds,
      sources,
      analysis,
      ...(result.ok
        ? { ...result.synthesis, writer: 'claude' as const, webSources: result.webSources }
        : {
            summary: `Built from ${analysis.signalCount} signals. The strongest subjects are ${analysis.subjects
              .slice(0, 3)
              .map((k) => `“${k.phrase}”`)
              .join(', ') || 'not clear yet'}${analysis.styles[0] ? `, led by ${analysis.styles[0].name} styling` : ''}.`,
            themes: [],
            palettes: analysis.colors.length
              ? [{ name: 'Colours in demand', colors: analysis.colors.slice(0, 5).map(({ name, hex }) => ({ name, hex })), note: 'The most-mentioned colours across all sources.' }]
              : [],
            ideas: ruleIdeas(input.niche, analysis, 8),
            writer: 'rules' as const,
            writerNote: result.message,
          }),
    };
    cache.set(key, { at: Date.now(), report });
    for (const [k, v] of cache) if (Date.now() - v.at > CACHE_MS) cache.delete(k);
    return reply.send({ ok: true, report });
  });

  // Rebuilds the prompts after the seller edits an idea's subject, styles or
  // palette in the idea board — no AI call, so it is instant and free.
  app.post<{ Body: { niche?: string; subject?: string; styles?: unknown; palette?: unknown } }>(
    '/api/research/prompts',
    async (req, reply) => {
      const b = req.body ?? {};
      const niche = (NICHES as readonly string[]).includes(b.niche ?? '') ? (b.niche as Niche) : null;
      const subject = typeof b.subject === 'string' ? b.subject.trim().slice(0, 120) : '';
      if (!niche || !subject) return reply.status(400).send({ ok: false, message: 'A niche and a subject are needed.' });
      const palette: PaletteColor[] = (Array.isArray(b.palette) ? b.palette : [])
        .filter((c): c is PaletteColor => typeof c?.name === 'string' && /^#[0-9a-f]{6}$/i.test(c?.hex ?? ''))
        .slice(0, 6);
      return reply.send({
        ok: true,
        prompts: buildPrompts({ niche, subject, styles: stringList(b.styles, 3, 40), palette }),
        specs: NICHE_SPECS[niche],
      });
    }
  );
}
