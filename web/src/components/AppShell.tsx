import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { activeShop, WORKSPACE } from '../data/workspace';
import { heroImages, useRun } from '../state/run';
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  GridIcon,
  ImageIcon,
  LinkIcon,
  PlusIcon,
} from './icons';

// Sidebar destinations per the handoff's Navigation model. Any wizard step
// highlights "New run", so that item matches on the whole /run prefix.
const NAV = [
  { to: '/', label: 'Dashboard', icon: GridIcon, match: (p: string) => p === '/' },
  { to: '/run/product', label: 'New run', icon: PlusIcon, match: (p: string) => p.startsWith('/run') },
  { to: '/review/15', label: 'Review queue', icon: CheckIcon, match: (p: string) => p.startsWith('/review') },
  { to: '/calendar', label: 'Calendar', icon: CalendarIcon, match: (p: string) => p.startsWith('/calendar') },
  { to: '/library', label: 'Library', icon: ImageIcon, match: (p: string) => p.startsWith('/library') },
  { to: '/connections', label: 'Connections', icon: LinkIcon, match: (p: string) => p.startsWith('/connections') },
];

export default function AppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { run } = useRun();

  // The badge used to be the mockup's hardcoded 30, which read as "you have 30
  // pins waiting" on a fresh install with nothing in it at all. Show the run's
  // size only once a run actually has images to work from, and show nothing
  // rather than a zero — an empty queue does not need a number.
  const queued = heroImages(run).length > 0 ? run.volume : null;

  // Likewise the header claimed "Content360 connected" unconditionally. Ask.
  const [c360, setC360] = useState<boolean | null>(null);
  useEffect(() => {
    fetch('/api/content360/status')
      .then((r) => r.json())
      .then((j) => setC360(Boolean(j?.ok && j?.configured)))
      .catch(() => setC360(false));
  }, []);
  const statusLabel =
    c360 === null
      ? 'Checking Content360…'
      : c360
        ? 'Content360 connected'
        : 'Content360 not configured';

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-wordmark">
            EXPRESS
            <br />
            ART VIBE
          </div>
          <div className="sidebar-product">Pin-Post Studio</div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(({ to, label, icon: Icon, match }) => {
            const badge = label === 'Review queue' ? queued : null;
            return (
              <NavLink
                key={label}
                to={to}
                className={match(pathname) ? 'nav-item active' : 'nav-item'}
              >
                <span className="nav-item-label">
                  <Icon />
                  {label}
                </span>
                {badge != null && <span className="nav-badge">{badge}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-workspace">
          <div className="sidebar-workspace-kicker">Workspace</div>
          <div className="sidebar-workspace-name">{WORKSPACE.name}</div>
          <div className="sidebar-workspace-meta">Content360 · {WORKSPACE.content360Id}</div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-brand">
            <div className="topbar-avatar">{activeShop.initials}</div>
            <div>
              <div className="topbar-shop-name">{activeShop.name}</div>
              <div className="topbar-shop-networks">
                {activeShop.source} · {activeShop.networks}
              </div>
            </div>
            <span className="topbar-chevron">
              <ChevronDownIcon />
            </span>
          </div>
          <div className="topbar-actions">
            <div className="topbar-status">
              <span className={c360 ? 'topbar-status-dot' : 'topbar-status-dot is-off'} />
              {statusLabel}
            </div>
            <button className="btn btn-secondary" type="button" onClick={() => navigate('/')}>
              Dashboard
            </button>
            <button className="btn btn-primary" type="button" onClick={() => navigate('/run/product')}>
              New run
            </button>
          </div>
        </header>

        <Outlet />
      </main>
    </div>
  );
}
