import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import IdeaCard, { CopyButton, Swatches } from '../components/IdeaCard';
import {
  chromePrompt,
  download,
  findingLineCount,
  ideasToCsv,
  profitTreePrompt,
  NICHE_LABEL,
  SOURCE_SHORT,
  useResearch,
  type Niche,
  type ResearchReport,
  type SourceId,
} from '../state/research';

// Trend Research: pick a niche, optionally narrow it with seed keywords, and
// the server asks search engines and marketplaces what buyers want right
// now. The report ranks what it found and turns it into product ideas with
// image prompts, ready to make and then run through the pin studio.

type Status = {
  claude: boolean;
  niches: { id: Niche; label: string; seeds: string[] }[];
  sources: { id: SourceId; label: string; configured: boolean; note: string }[];
};

const STATUS_TAG: Record<string, string> = {
  ok: 'tag tag-neutral',
  failed: 'tag tag-accent',
  not_configured: 'tag tag-outline',
  skipped: 'tag tag-outline',
};
const STATUS_WORD: Record<string, string> = {
  ok: 'OK',
  failed: 'Failed',
  not_configured: 'No key',
  skipped: 'Skipped',
};

// Every number a listing has, not just the first: pasted ProfitTree rows
// carry estimated sales alongside favourites.
function whyListed(l: ResearchReport['analysis']['topListings'][number]): string {
  const parts = [
    l.boughtLastMonth
      ? l.source === 'amazon'
        ? `${l.boughtLastMonth.toLocaleString()}+ bought last month`
        : `~${l.boughtLastMonth.toLocaleString()} sales / month`
      : null,
    l.favoritesPer30d !== undefined ? `${l.favoritesPer30d} favourites / 30 days` : null,
    l.reviews ? `${l.reviews.toLocaleString()} reviews` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Newest in store';
}

function money(n: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n}`;
  }
}

export default function Research() {
  const { form, setForm, report, setReport, history, saveIdea, isSaved, board } = useResearch();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedSources, setFailedSources] = useState<ResearchReport['sources']>([]);

  useEffect(() => {
    fetch('/api/research/status')
      .then((r) => r.json())
      .then((j) => j?.ok && setStatus(j))
      .catch(() => setStatus(null));
  }, []);

  const defaultSeeds = status?.niches.find((n) => n.id === form.niche)?.seeds ?? [];
  const seedList = form.seeds.split(',').map((s) => s.trim()).filter(Boolean);
  const promptSeeds = seedList.length ? seedList : defaultSeeds.slice(0, 3);
  const pasted = findingLineCount(form.findings);
  const [pasteOpen, setPasteOpen] = useState(pasted > 0);

  const run = async () => {
    setRunning(true);
    setError(null);
    setFailedSources([]);
    try {
      const res = await fetch('/api/research/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          niche: form.niche,
          seeds: form.seeds.split(',').map((s) => s.trim()).filter(Boolean),
          sources: form.sources,
          shopifyStores: form.shopifyStores.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
          findings: form.findings,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.message ?? 'The research did not complete.');
        setFailedSources(json.sources ?? []);
      } else {
        setReport(json.report);
      }
    } catch {
      setError('Could not reach the server. Check it is running and try again.');
    } finally {
      setRunning(false);
    }
  };

  const toggleSource = (id: SourceId) =>
    setForm({
      ...form,
      sources: form.sources.includes(id) ? form.sources.filter((s) => s !== id) : [...form.sources, id],
    });

  return (
    <section className="page rs-page">
      <div className="page-kicker">Trend research</div>
      <h1>What to make next</h1>
      <p className="page-lead">
        Asks Google, Bing, Pinterest, Etsy, Amazon and Shopify storefronts what buyers are searching for and
        saving right now, then turns it into product ideas — with image prompts for your generator and Etsy
        copy for the listing. When the art is made, start a pin run from the idea.
      </p>

      <div className="rs-form">
        <div className="rs-form-row">
          <div>
            <div className="field-label">Niche</div>
            <div className="seg" role="radiogroup" aria-label="Niche">
              {(Object.keys(NICHE_LABEL) as Niche[]).map((n) => (
                <label key={n} className="seg-opt">
                  <input
                    type="radio"
                    name="niche"
                    checked={form.niche === n}
                    onChange={() => setForm({ ...form, niche: n })}
                  />
                  {NICHE_LABEL[n]}
                </label>
              ))}
            </div>
          </div>
          <div className="field rs-grow">
            <label htmlFor="rs-seeds">Seed keywords — optional, comma separated</label>
            <input
              id="rs-seeds"
              className="input"
              value={form.seeds}
              placeholder={defaultSeeds.join(', ') || 'e.g. mushroom wall art, cherry red decor'}
              onChange={(e) => setForm({ ...form, seeds: e.target.value })}
            />
          </div>
        </div>

        <div className="field-label" style={{ marginTop: 18 }}>Sources</div>
        <div className="rs-sources">
          {(status?.sources ?? []).map((s) => (
            <label key={s.id} className={`rs-source ${s.configured ? '' : 'is-off'}`}>
              <input type="checkbox" checked={form.sources.includes(s.id)} onChange={() => toggleSource(s.id)} />
              <span>
                <span className="rs-source-name">{s.label}</span>
                <span className="rs-source-note">{s.note}</span>
              </span>
            </label>
          ))}
          {!status && <div className="rail-note">Checking which sources are set up…</div>}
        </div>

        {form.sources.includes('shopify') && (
          <div className="field" style={{ marginTop: 14, maxWidth: 640 }}>
            <label htmlFor="rs-stores">Shopify stores to compare — domains, one per line or comma separated (up to 8)</label>
            <textarea
              id="rs-stores"
              className="input"
              style={{ minHeight: 64 }}
              value={form.shopifyStores}
              placeholder={'competitor-one.com\nanother-print-shop.com'}
              onChange={(e) => setForm({ ...form, shopifyStores: e.target.value })}
            />
          </div>
        )}

        <div className="rs-paste">
          <button type="button" className="rs-paste-toggle" aria-expanded={pasteOpen} onClick={() => setPasteOpen((o) => !o)}>
            <span>{pasteOpen ? '−' : '+'}</span> Add findings from Claude in Chrome or ProfitTree
            {pasted > 0 && <span className="tag tag-accent" style={{ marginLeft: 8 }}>{pasted} lines</span>}
          </button>
          {pasteOpen && (
            <div className="rs-paste-body">
              <p className="rail-note" style={{ marginTop: 0 }}>
                For data this server can't fetch itself, such as Pinterest and Etsy through your own logins or ProfitTree's
                Etsy numbers, copy a prompt into a Claude chat that has Claude in Chrome or ProfitTree connected, then paste
                its reply here. It counts in the report under its own source.
              </p>
              <div className="rs-idea-actions">
                <CopyButton text={chromePrompt(form.niche, promptSeeds)} label="Copy prompt for Claude in Chrome" />
                <CopyButton text={profitTreePrompt(form.niche, promptSeeds)} label="Copy prompt for ProfitTree" />
                {form.findings && (
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => setForm({ ...form, findings: '' })}>
                    Clear
                  </button>
                )}
              </div>
              <textarea
                className="input rs-paste-box"
                value={form.findings}
                aria-label="Pasted findings"
                placeholder={
                  'pinterest | cherry red kitchen decor | growth 120% | yoy 340%\n' +
                  'etsy | vintage mushroom print | price 6.50 | sales 45 | favorites 900\n' +
                  'etsy | mushroom wall art | searches 5400 | competition 41000'
                }
                onChange={(e) => setForm({ ...form, findings: e.target.value })}
              />
              <div className="rail-note" style={{ marginTop: 6 }}>
                One finding per line: <code>source | phrase | name value | …</code>. Sources: pinterest, etsy, amazon,
                google, bing, shopify, other. Numbers it understands: growth, yoy, price, sales, favorites, reviews, searches,
                competition, age. Lines it can't read are skipped and counted in the report.
              </div>
            </div>
          )}
        </div>

        <div className="rs-run-row">
          <button
            className="btn btn-primary"
            type="button"
            disabled={running || (form.sources.length === 0 && pasted === 0)}
            onClick={run}
          >
            {running ? 'Researching…' : 'Run research'}
          </button>
          <span className="rail-note" style={{ margin: 0 }}>
            {running
              ? 'Collecting signals, then writing ideas — usually under a minute, longer with web reports on.'
              : status && !status.claude
                ? 'No Anthropic key: ideas come from the built-in generator, built from the same signals.'
                : 'Results are cached for 30 minutes, so re-running the same search costs nothing.'}
          </span>
        </div>

        {error && (
          <div className="ingest-error" style={{ marginTop: 14 }}>
            {error}
            {failedSources.length > 0 && (
              <ul className="rs-evidence" style={{ marginTop: 8 }}>
                {failedSources.map((s) => (
                  <li key={s.source}>
                    <b>{s.label}:</b> {s.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {history.length > 1 && (
        <div className="rs-history">
          <span className="field-label">Earlier reports</span>
          <select
            className="input"
            style={{ width: 'auto' }}
            value={report?.id ?? ''}
            onChange={(e) => setReport(history.find((h) => h.id === e.target.value) ?? null)}
          >
            {history.map((h) => (
              <option key={h.id} value={h.id}>
                {NICHE_LABEL[h.niche]} — {h.seeds.slice(0, 2).join(', ')} — {new Date(h.createdAt).toLocaleString()}
              </option>
            ))}
          </select>
        </div>
      )}

      {report && (
        <ReportView
          report={report}
          isSaved={isSaved}
          onSave={(i) => saveIdea(i, report.id)}
          boardCount={board.length}
          openBoard={() => navigate('/ideas')}
        />
      )}
    </section>
  );
}

function ReportView({
  report,
  isSaved,
  onSave,
  boardCount,
  openBoard,
}: {
  report: ResearchReport;
  isSaved: (i: ResearchReport['ideas'][number], reportId: string) => boolean;
  onSave: (i: ResearchReport['ideas'][number]) => void;
  boardCount: number;
  openBoard: () => void;
}) {
  const a = report.analysis;
  return (
    <div className="rs-report">
      <div className="rs-report-meta">
        {NICHE_LABEL[report.niche]} · {report.seeds.join(', ')} · {a.signalCount} signals ·{' '}
        {new Date(report.createdAt).toLocaleString()} ·{' '}
        {report.writer === 'claude' ? 'Ideas by Claude' : 'Ideas by the built-in generator'}
      </div>

      <div className="rs-source-strip">
        {report.sources.map((s) => (
          <div key={s.source} className="rs-source-chip" title={s.message}>
            <span className={STATUS_TAG[s.status]}>{STATUS_WORD[s.status]}</span>
            <span className="rs-source-chip-name">{s.label}</span>
            <span className="rs-source-chip-msg">{s.message}</span>
          </div>
        ))}
      </div>

      {report.writerNote && <div className="push-warn-bar" style={{ marginTop: 12 }}>{report.writerNote}</div>}

      {report.summary && <p className="rs-summary">{report.summary}</p>}

      <div className="rs-section-head">
        <h2>Product ideas</h2>
        <div className="rs-section-actions">
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() => download(`ideas-${report.niche}-${report.createdAt.slice(0, 10)}.csv`, ideasToCsv(report.ideas))}
          >
            Export CSV
          </button>
          <button type="button" className="btn btn-secondary btn-small" onClick={openBoard}>
            Idea board ({boardCount})
          </button>
        </div>
      </div>
      <div className="rs-ideas">
        {report.ideas.map((idea) => (
          <IdeaCard key={idea.id} idea={idea} saved={isSaved(idea, report.id)} onSave={() => onSave(idea)} />
        ))}
      </div>

      {report.themes.length > 0 && (
        <>
          <h2 className="rs-h2">Trend themes</h2>
          <div className="rs-themes">
            {report.themes.map((t) => (
              <div key={t.name} className="card">
                <div className="card-title">{t.name}</div>
                <p className="card-body">{t.summary}</p>
                <ul className="rs-evidence">
                  {t.evidence.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}

      {report.palettes.length > 0 && (
        <>
          <h2 className="rs-h2">Palettes</h2>
          <div className="rs-palettes">
            {report.palettes.map((p) => (
              <div key={p.name} className="rs-palette">
                <div className="rs-palette-bar">
                  {p.colors.map((c) => (
                    <div key={c.hex + c.name} style={{ background: c.hex }} title={`${c.name} ${c.hex}`} />
                  ))}
                </div>
                <div className="rs-palette-name">{p.name}</div>
                <div className="rs-palette-hex">{p.colors.map((c) => `${c.name} ${c.hex}`).join(' · ')}</div>
                {p.note && <div className="rail-note" style={{ marginTop: 4 }}>{p.note}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="rs-two-col">
        <div>
          <h2 className="rs-h2">Buyer keywords</h2>
          {a.keywords.length === 0 ? (
            <div className="rail-note">No keywords — the sources that answered had too little data.</div>
          ) : (
            <table className="table rs-table">
              <thead>
                <tr>
                  <th>Phrase</th>
                  <th>Signal</th>
                  <th>Seen on</th>
                  <th title="Average Etsy favourites per 30 days on listings using the phrase">Etsy ♥/30d</th>
                  <th title="Pinterest search growth, month on month or year on year">Pinterest</th>
                </tr>
              </thead>
              <tbody>
                {a.keywords.slice(0, 30).map((k) => (
                  <tr key={k.phrase}>
                    <td>{k.phrase}</td>
                    <td>
                      <div className="rs-bar">
                        <div style={{ width: `${k.score}%` }} />
                      </div>
                    </td>
                    <td className="rs-muted">{k.sources.map((s) => SOURCE_SHORT[s]).join(', ')}</td>
                    <td>{k.etsyFavoritesPer30d ?? '—'}</td>
                    <td>{k.pinterestGrowth ? `+${Math.round(k.pinterestGrowth)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div>
          <h2 className="rs-h2">Colours in demand</h2>
          {a.colors.length ? (
            <div className="rs-color-list">
              {a.colors.map((c) => (
                <div key={c.name} className="rs-color-row">
                  <Swatches colors={[c]} size={18} />
                  <span>{c.name}</span>
                  <span className="rs-muted">{c.hex}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rail-note">No colour words found.</div>
          )}
          <h2 className="rs-h2">Styles & patterns</h2>
          <div className="rs-chips">
            {a.styles.map((s) => (
              <span key={s.name} className="tag tag-neutral" title={`Seen on ${s.sources.map((x) => SOURCE_SHORT[x]).join(', ')}`}>
                {s.name}
              </span>
            ))}
            {!a.styles.length && <div className="rail-note">No style words found.</div>}
          </div>

          {Object.keys(a.prices).length > 0 && (
            <>
              <h2 className="rs-h2">Prices</h2>
              <table className="table rs-table">
                <thead>
                  <tr>
                    <th>Where</th>
                    <th>Median</th>
                    <th>Range</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(a.prices).map(([src, p]) => (
                    <tr key={src}>
                      <td>{SOURCE_SHORT[src as SourceId]} ({p!.n})</td>
                      <td>{money(p!.median, p!.currency)}</td>
                      <td className="rs-muted">
                        {money(p!.min, p!.currency)} – {money(p!.max, p!.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {a.etsyCompetition !== undefined && (
            <p className="rail-note">
              {a.etsyCompetition.toLocaleString()} active Etsy listings match the main seed — the competition you are
              entering.
            </p>
          )}
        </div>
      </div>

      {a.topListings.length > 0 && (
        <>
          <h2 className="rs-h2">Listings worth studying</h2>
          <table className="table rs-table">
            <thead>
              <tr>
                <th>Where</th>
                <th>Listing</th>
                <th>Price</th>
                <th>Why it is here</th>
              </tr>
            </thead>
            <tbody>
              {a.topListings.map((l, i) => (
                <tr key={i}>
                  <td>{l.store ?? SOURCE_SHORT[l.source]}</td>
                  <td>
                    {l.url ? (
                      <a href={l.url} target="_blank" rel="noreferrer">
                        {l.title}
                      </a>
                    ) : (
                      l.title
                    )}
                  </td>
                  <td>{l.price !== undefined ? money(l.price, l.currency ?? 'USD') : '—'}</td>
                  <td className="rs-muted">{whyListed(l)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {report.webSources && report.webSources.length > 0 && (
        <>
          <h2 className="rs-h2">Articles Claude read</h2>
          <ul className="rs-evidence">
            {report.webSources.map((w) => (
              <li key={w.url}>
                <a href={w.url} target="_blank" rel="noreferrer">
                  {w.title}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="rail-note" style={{ marginTop: 24, maxWidth: '48em' }}>
        About these numbers: none of these sources publish sales. Signals are demand — what buyers type, what is
        growing, what gets favourited and bought — weighted more when several sources agree. Treat the ideas as
        well-evidenced bets, not guarantees.
      </p>
    </div>
  );
}
