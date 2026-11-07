import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import IdeaCard from '../components/IdeaCard';
import { download, ideasToCsv, NICHE_LABEL, useResearch, type Niche, type SavedIdea } from '../state/research';

// The idea board: ideas saved from research reports, tracked from "to make"
// to "listed". Editing an idea's subject or styles rebuilds its prompts
// without another AI call.

const STATUS_LABEL: Record<SavedIdea['status'], string> = {
  todo: 'To make',
  making: 'Making',
  listed: 'Listed',
};

function Editor({ idea }: { idea: SavedIdea }) {
  const { updateIdea, removeIdea } = useResearch();
  const [subject, setSubject] = useState(idea.subject);
  const [styles, setStyles] = useState(idea.styles.join(', '));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const rebuild = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const st = styles.split(',').map((s) => s.trim()).filter(Boolean);
      const res = await fetch('/api/research/prompts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ niche: idea.niche, subject, styles: st, palette: idea.palette }),
      });
      const json = await res.json();
      if (!json.ok) setMsg(json.message ?? 'Could not rebuild the prompts.');
      else updateIdea(idea.id, { subject, styles: st, prompts: json.prompts, specs: json.specs });
    } catch {
      setMsg('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rs-board-edit">
      <div className="rs-form-row">
        <div className="field">
          <label>Status</label>
          <select
            className="input"
            value={idea.status}
            onChange={(e) => updateIdea(idea.id, { status: e.target.value as SavedIdea['status'] })}
          >
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="field rs-grow">
          <label>Subject</label>
          <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div className="field rs-grow">
          <label>Styles</label>
          <input className="input" value={styles} onChange={(e) => setStyles(e.target.value)} />
        </div>
      </div>
      <div className="field" style={{ marginTop: 8 }}>
        <label>Notes</label>
        <textarea
          className="input"
          style={{ minHeight: 50 }}
          value={idea.notes}
          placeholder="Generator used, seed, what worked…"
          onChange={(e) => updateIdea(idea.id, { notes: e.target.value })}
        />
      </div>
      <div className="rs-idea-actions" style={{ marginTop: 8 }}>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          disabled={busy || !subject.trim() || (subject === idea.subject && styles === idea.styles.join(', '))}
          onClick={rebuild}
        >
          {busy ? 'Rebuilding…' : 'Rebuild prompts from edits'}
        </button>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => removeIdea(idea.id)}>
          Remove
        </button>
        {msg && <span className="rewrite-note">{msg}</span>}
      </div>
    </div>
  );
}

export default function Ideas() {
  const { board } = useResearch();
  const navigate = useNavigate();
  const [niche, setNiche] = useState<Niche | 'all'>('all');
  const [status, setStatus] = useState<SavedIdea['status'] | 'all'>('all');
  const shown = board.filter((i) => (niche === 'all' || i.niche === niche) && (status === 'all' || i.status === status));

  return (
    <section className="page rs-page">
      <div className="page-kicker">Trend research</div>
      <h1>Idea board</h1>
      <p className="page-lead">
        Ideas you saved from research, with their prompts and Etsy copy. Make the art in your image generator,
        then start a pin run from the idea and upload the finished design.
      </p>

      {board.length === 0 ? (
        <div className="library-empty">
          <div className="rail-note" style={{ margin: 0 }}>No saved ideas yet.</div>
          <button className="btn btn-primary" type="button" style={{ marginTop: 14 }} onClick={() => navigate('/research')}>
            Run research
          </button>
        </div>
      ) : (
        <>
          <div className="rs-section-head" style={{ marginTop: 0 }}>
            <div className="rs-form-row">
              <select className="input" style={{ width: 'auto' }} value={niche} onChange={(e) => setNiche(e.target.value as Niche | 'all')}>
                <option value="all">All niches</option>
                {(Object.keys(NICHE_LABEL) as Niche[]).map((n) => (
                  <option key={n} value={n}>
                    {NICHE_LABEL[n]}
                  </option>
                ))}
              </select>
              <select
                className="input"
                style={{ width: 'auto' }}
                value={status}
                onChange={(e) => setStatus(e.target.value as SavedIdea['status'] | 'all')}
              >
                <option value="all">Any status</option>
                {Object.entries(STATUS_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l} ({board.filter((i) => i.status === v).length})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => download(`idea-board-${new Date().toISOString().slice(0, 10)}.csv`, ideasToCsv(shown))}
            >
              Export CSV ({shown.length})
            </button>
          </div>
          <div className="rs-ideas">
            {shown.map((idea) => (
              <IdeaCard key={idea.id} idea={idea}>
                <Editor idea={idea} />
              </IdeaCard>
            ))}
          </div>
        </>
      )}
      <p className="rail-note" style={{ marginTop: 18 }}>
        The board is saved in this browser. Export a CSV to keep a copy or share it.
      </p>
    </section>
  );
}
