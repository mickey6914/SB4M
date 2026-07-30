import { useEffect, useState } from 'react';
import { activeShop, WORKSPACE } from '../data/workspace';
import { useWorkspace } from '../state/workspace';

// Connections, README section 10: the accounts Content360 owns, and the
// workspace rules that are set once here and applied to every run. The rules
// are live — the scheduler and the push read them, they are not decoration.

type Status = { configured: boolean; workspaceId: string };
type SceneStatus = { active: string; google: boolean; openai: boolean };

const ACCOUNTS = [
  {
    name: 'Pinterest',
    detail: 'Boards: Gift Ideas · Home Decor · Clip Art · Amazon Finds · Printables',
    crop: '2:3 pins',
  },
  { name: 'Facebook Page', detail: 'Deals and Steals For Real', crop: '1:1 posts' },
  { name: 'Instagram Business', detail: 'Express Art Vibe', crop: '4:5 feed · 9:16 story' },
];

export default function Connections() {
  const { rules, update, reset } = useWorkspace();
  const [status, setStatus] = useState<Status | null>(null);
  const [scenes, setScenes] = useState<SceneStatus | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, sc] = await Promise.all([
          fetch('/api/content360/status').then((r) => r.json()),
          fetch('/api/scenes/status').then((r) => r.json()),
        ]);
        if (s.ok) setStatus({ configured: s.configured, workspaceId: s.workspaceId });
        if (sc.ok) setScenes({ active: sc.active, google: sc.google, openai: sc.openai });
      } catch {
        // Leave the panels showing "checking…" rather than inventing a state.
      }
    })();
  }, []);

  const providerLabel =
    scenes?.active === 'google'
      ? 'Google (Imagen / Gemini)'
      : scenes?.active === 'openai'
        ? 'OpenAI (GPT Image)'
        : 'Built-in backdrops (no key yet)';

  return (
    <section className="conn-layout">
      <div>
        <h1 className="calendar-h1">Connections</h1>
        <p className="page-lead" style={{ maxWidth: '40em' }}>
          Pin-Post Studio never posts directly. Content360 owns the accounts, the publishing and the
          retries — we hand it finished assets and the times to publish them.
        </p>

        <div className="conn-list">
          {ACCOUNTS.map((a, i) => (
            <div key={a.name} className="conn-row">
              <div>
                <div className="conn-name">{a.name}</div>
                <div className="rail-note" style={{ marginTop: 2 }}>
                  {a.detail}
                </div>
                <div className="rail-note" style={{ marginTop: 2 }}>
                  Receives {a.crop}
                </div>
              </div>
              <span className={i === 2 ? 'tag tag-accent' : 'tag tag-neutral'}>
                {i === 2 ? 'Attention' : 'Connected'}
              </span>
            </div>
          ))}
        </div>

        <div className="rail-note" style={{ marginTop: 14, maxWidth: '40em' }}>
          Account state is reported by Content360. Until the API key is set below, this list shows
          the accounts named in your workspace rather than live status.
        </div>

        <div className="dash-actions">
          <button className="btn btn-secondary" type="button" disabled title="Needs the Content360 API key">
            Refresh boards
          </button>
          <a
            className="btn btn-ghost"
            href={`https://app.content360.io/os/${status?.workspaceId ?? WORKSPACE.content360Id}`}
            target="_blank"
            rel="noreferrer"
          >
            Open in Content360
          </a>
        </div>

        <div className="conn-services">
          <div className="rail-kicker">Services</div>
          <div className="conn-service-row">
            <span>Content360 push</span>
            <span className={status?.configured ? 'tag tag-neutral' : 'tag tag-accent'}>
              {status === null ? 'Checking…' : status.configured ? 'Key set' : 'No key yet'}
            </span>
          </div>
          <div className="conn-service-row">
            <span>Scene backgrounds</span>
            <span className={scenes && scenes.active !== 'procedural' ? 'tag tag-neutral' : 'tag tag-accent'}>
              {scenes === null ? 'Checking…' : providerLabel}
            </span>
          </div>
          <div className="rail-note" style={{ marginTop: 10 }}>
            Keys live in <code className="mono">server/.env</code> — see{' '}
            <code className="mono">.env.example</code> for what each one unlocks.
          </div>
        </div>
      </div>

      <div className="rail-right">
        <div className="rail-kicker">Workspace rules</div>
        <div className="choice-list">
          <label className="choice-row">
            <input
              type="checkbox"
              checked={rules.requireAd}
              onChange={(e) => update({ requireAd: e.target.checked })}
            />
            Add #ad to every affiliate description
          </label>
          <label className="choice-row">
            <input
              type="checkbox"
              checked={rules.windowOnly}
              onChange={(e) => update({ windowOnly: e.target.checked })}
            />
            Only post between {String(rules.windowStart).padStart(2, '0')}:00 and{' '}
            {String(rules.windowEnd).padStart(2, '0')}:00
          </label>
          <label className="choice-row">
            <input
              type="checkbox"
              checked={rules.noRepeatPerDay}
              onChange={(e) => update({ noRepeatPerDay: e.target.checked })}
            />
            Never repeat one product on a network the same day
          </label>
          <label className="choice-row">
            <input
              type="checkbox"
              checked={rules.requireApproval}
              onChange={(e) => update({ requireApproval: e.target.checked })}
            />
            Require my approval before pushing
          </label>
        </div>

        <div className="field-block">
          <div className="field-label">Posting window</div>
          <div className="conn-window">
            <input
              className="input"
              type="number"
              min={0}
              max={23}
              value={rules.windowStart}
              onChange={(e) => update({ windowStart: Number(e.target.value) })}
            />
            <span className="rail-note" style={{ margin: 0 }}>
              to
            </span>
            <input
              className="input"
              type="number"
              min={0}
              max={23}
              value={rules.windowEnd}
              onChange={(e) => update({ windowEnd: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="field-block">
          <div className="field-label">Max posts per network per day</div>
          <input
            className="input"
            type="number"
            min={1}
            max={12}
            value={rules.maxPerNetworkPerDay}
            onChange={(e) => update({ maxPerNetworkPerDay: Number(e.target.value) })}
          />
        </div>

        <div className="field-block">
          <div className="field-label">Default text overlay</div>
          <input
            className="input"
            type="text"
            value={rules.defaultOverlay}
            onChange={(e) => update({ defaultOverlay: e.target.value })}
          />
        </div>

        <div className="conn-api-id">
          <div className="rail-kicker" style={{ marginBottom: 6 }}>
            Workspace API id
          </div>
          <div className="mono">{status?.workspaceId ?? WORKSPACE.content360Id}</div>
          <div className="rail-note" style={{ marginTop: 6 }}>
            {activeShop.name} · {activeShop.source}
          </div>
        </div>

        <button className="btn btn-ghost" type="button" style={{ marginTop: 16 }} onClick={reset}>
          Reset to defaults
        </button>
      </div>
    </section>
  );
}
