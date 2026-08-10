import { useEffect, useState } from 'react';
import { activeShop, WORKSPACE } from '../data/workspace';
import { useWorkspace, type NetworkKey } from '../state/workspace';

// Connections, README section 10: the accounts Content360 owns, and the
// workspace rules that are set once here and applied to every run. The rules
// are live — the scheduler and the push read them, they are not decoration.

type Status = { configured: boolean; workspaceId: string };
type SceneStatus = {
  active: string;
  abacus: boolean;
  google: boolean;
  openai: boolean;
  settingError: string | null;
};

type Board = { id: string; name: string };
type Account = {
  id: number;
  network: 'pinterest' | 'facebook' | 'instagram' | null;
  provider: string;
  name: string;
  username: string;
  authorized: boolean;
  boards: Board[];
};

// Which crop each network receives, from the fan-out rules in DECISIONS.md #3.
const CROPS: Record<string, string> = {
  pinterest: '2:3 pins',
  facebook: '1:1 posts',
  instagram: '4:5 feed · 9:16 story',
};

// Shown until Content360 answers — the accounts named in the workspace, not
// live status. Replaced wholesale once the real list arrives.
const PLACEHOLDER_ACCOUNTS = [
  { name: 'Pinterest', detail: 'Boards load once the API key is set', crop: CROPS.pinterest },
  { name: 'Facebook Page', detail: 'Deals and Steals For Real', crop: CROPS.facebook },
  { name: 'Instagram Business', detail: 'Express Art Vibe', crop: CROPS.instagram },
];

const NETWORK_LABEL: Record<string, string> = {
  pinterest: 'Pinterest',
  facebook: 'Facebook Page',
  instagram: 'Instagram Business',
};

const NETWORKS: NetworkKey[] = ['pinterest', 'facebook', 'instagram'];

export default function Connections() {
  const { rules, update, reset } = useWorkspace();
  const [status, setStatus] = useState<Status | null>(null);
  const [scenes, setScenes] = useState<SceneStatus | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [accountsError, setAccountsError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Boards ride along on the accounts record — there is no separate boards
  // endpoint — so loading accounts and refreshing boards are the same call.
  const loadAccounts = async () => {
    setRefreshing(true);
    setAccountsError('');
    try {
      const res = await fetch('/api/content360/accounts');
      const json = await res.json();
      if (json.ok) {
        setAccounts(json.accounts);
      } else {
        setAccounts(null);
        setAccountsError(json.message ?? 'Content360 did not return the account list.');
      }
    } catch {
      setAccounts(null);
      setAccountsError('Could not reach the server — showing the workspace list instead.');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [s, sc] = await Promise.all([
          fetch('/api/content360/status').then((r) => r.json()),
          fetch('/api/scenes/status').then((r) => r.json()),
        ]);
        if (s.ok) setStatus({ configured: s.configured, workspaceId: s.workspaceId });
        if (sc.ok)
          setScenes({
            active: sc.active,
            abacus: sc.abacus,
            google: sc.google,
            openai: sc.openai,
            settingError: sc.settingError ?? null,
          });
        // Only ask for accounts once we know a key exists; otherwise the
        // 503 is noise the "No key yet" tag already communicates.
        if (s.ok && s.configured) await loadAccounts();
      } catch {
        // Leave the panels showing "checking…" rather than inventing a state.
      }
    })();
  }, []);

  // Seed each network's account the first time we see the real list, and
  // re-seed if a stored choice has since been disconnected. The shop names
  // its own handle, so a workspace holding two Instagram accounts resolves to
  // the right one instead of whichever the API listed first. Deliberately
  // keyed on `accounts` alone: this settles a default, it does not fight the
  // seller's own choice on every render.
  useEffect(() => {
    if (!accounts) return;
    const next = { ...rules.accountByNetwork };
    let changed = false;
    for (const network of NETWORKS) {
      const live = accounts.filter((a) => a.network === network && a.authorized);
      if (live.length === 0) continue;
      const current = next[network];
      if (current && live.some((a) => a.id === current.id)) continue;
      const handle = activeShop.handles[network]?.toLowerCase();
      const pick = live.find((a) => a.username.toLowerCase() === handle) ?? live[0];
      next[network] = { id: pick.id, label: pick.username || pick.name };
      changed = true;
    }
    if (changed) update({ accountByNetwork: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  const chosenId = (network: NetworkKey) => rules.accountByNetwork[network]?.id;
  const accountsFor = (network: NetworkKey) =>
    (accounts ?? []).filter((a) => a.network === network);

  // Boards belong to a Pinterest account, so they follow whichever account is
  // chosen — not the first one in the list.
  const pinterestAccount =
    accountsFor('pinterest').find((a) => a.id === chosenId('pinterest')) ??
    accountsFor('pinterest')[0] ??
    null;
  const boards = pinterestAccount?.boards ?? [];

  const pickBoard = (id: string) => {
    update({
      pinterestBoardId: id,
      pinterestBoardName: boards.find((b) => b.id === id)?.name ?? '',
    });
  };

  const pickAccount = (network: NetworkKey, id: number) => {
    const account = accountsFor(network).find((a) => a.id === id);
    if (!account) return;
    update({
      accountByNetwork: {
        ...rules.accountByNetwork,
        [network]: { id, label: account.username || account.name },
      },
      // A board id belongs to one Pinterest account. Switching accounts
      // invalidates it, so clear rather than push a pin at a board the new
      // account does not own.
      ...(network === 'pinterest' && !account.boards.some((b) => b.id === rules.pinterestBoardId)
        ? { pinterestBoardId: '', pinterestBoardName: '' }
        : {}),
    });
  };

  const providerLabel = scenes?.settingError
    ? 'Setting not recognised'
    : scenes?.active === 'abacus'
      ? 'Abacus (RouteLLM)'
      : scenes?.active === 'google'
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
          {accounts === null
            ? PLACEHOLDER_ACCOUNTS.map((a) => (
                <div key={a.name} className="conn-row">
                  <div>
                    <div className="conn-name">{a.name}</div>
                    <div className="rail-note" style={{ marginTop: 2 }}>
                      {/* A board chosen earlier still reads back here, which
                          is why the name is stored next to the id. */}
                      {a.name === 'Pinterest' && rules.pinterestBoardName
                        ? `Board: ${rules.pinterestBoardName}`
                        : a.detail}
                    </div>
                    <div className="rail-note" style={{ marginTop: 2 }}>
                      Receives {a.crop}
                    </div>
                  </div>
                  <span className="tag tag-neutral">In workspace</span>
                </div>
              ))
            : NETWORKS.map((network) => {
                const live = accountsFor(network);
                if (live.length === 0) return null;
                const chosen = live.find((a) => a.id === chosenId(network)) ?? live[0];
                return (
                  <div key={network} className="conn-row">
                    <div>
                      <div className="conn-name">{NETWORK_LABEL[network]}</div>

                      {/* The account picker. Only a network with more than one
                          connected account is a choice; the rest just say who
                          receives the posts. */}
                      {live.length > 1 ? (
                        <div className="conn-pick">
                          <label className="field-label" htmlFor={`account-${network}`}>
                            Account that receives these posts
                          </label>
                          <select
                            id={`account-${network}`}
                            className="input"
                            value={chosen.id}
                            onChange={(e) => pickAccount(network, Number(e.target.value))}
                          >
                            {live.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.username || a.name}
                                {a.authorized ? '' : ' (needs reconnecting)'}
                              </option>
                            ))}
                          </select>
                          <div className="rail-note" style={{ marginTop: 6 }}>
                            {live.length} accounts connected on this network.
                          </div>
                        </div>
                      ) : (
                        <div className="rail-note" style={{ marginTop: 2 }}>
                          {chosen.name}
                          {chosen.username && chosen.username !== chosen.name
                            ? ` · @${chosen.username}`
                            : ''}
                        </div>
                      )}

                      <div className="rail-note" style={{ marginTop: 2 }}>
                        Receives {CROPS[network]}
                      </div>

                      {/* The board picker. Pinterest needs a board to publish
                          to, and it is the one destination Content360 cannot
                          pick for us. One board per workspace, per DECISIONS #1
                          — a second shop gets its own. */}
                      {network === 'pinterest' && (
                        <div className="conn-pick">
                          <label className="field-label" htmlFor="pinterest-board">
                            Board for every pin
                          </label>
                          <select
                            id="pinterest-board"
                            className="input"
                            value={rules.pinterestBoardId}
                            onChange={(e) => pickBoard(e.target.value)}
                          >
                            <option value="">Choose a board…</option>
                            {boards.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                          <div className="rail-note" style={{ marginTop: 6 }}>
                            {rules.pinterestBoardId
                              ? `${boards.length} boards on this account.`
                              : `${boards.length} boards on this account — pins cannot publish until one is chosen.`}
                          </div>
                        </div>
                      )}
                    </div>
                    <span className={chosen.authorized ? 'tag tag-neutral' : 'tag tag-accent'}>
                      {chosen.authorized ? 'Connected' : 'Attention'}
                    </span>
                  </div>
                );
              })}
        </div>

        <div className="rail-note" style={{ marginTop: 14, maxWidth: '40em' }}>
          {accountsError ||
            (accounts === null
              ? 'Account state is reported by Content360. Until the API key is set below, this list shows the accounts named in your workspace rather than live status.'
              : 'Live from Content360. Boards come back with the accounts, so refreshing the list refreshes the boards.')}
        </div>

        <div className="dash-actions">
          <button
            className="btn btn-secondary"
            type="button"
            disabled={!status?.configured || refreshing}
            title={status?.configured ? undefined : 'Needs the Content360 API key'}
            onClick={loadAccounts}
          >
            {refreshing ? 'Refreshing…' : 'Refresh boards'}
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
            <span
              className={
                scenes && !scenes.settingError && scenes.active !== 'procedural'
                  ? 'tag tag-neutral'
                  : 'tag tag-accent'
              }
            >
              {scenes === null ? 'Checking…' : providerLabel}
            </span>
          </div>
          {scenes?.settingError ? (
            <div className="rail-note" style={{ marginTop: 10 }}>
              {scenes.settingError} Backgrounds are paused until it is corrected — a name the app
              does not know is not quietly swapped for another provider.
            </div>
          ) : null}
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
            Remind me when a description has no #ad
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
