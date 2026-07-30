import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { heroImages, useRun } from '../state/run';
import { useWorkspace } from '../state/workspace';

// The cross-network calendar, README section 8: Monday-start month grid,
// network color coding, gap detection, and per-post sync state. Posts come
// from the server's scheduling engine (workspace rules enforced there).

type Network = 'pinterest' | 'facebook' | 'instagram';

type Post = {
  id: string;
  pinIndex: number;
  network: Network;
  date: string;
  time: string;
  state: 'queued' | 'pushed' | 'published' | 'failed';
};

const NETWORK_LABEL: Record<Network, string> = {
  pinterest: 'Pin',
  facebook: 'FB post',
  instagram: 'IG post',
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function Calendar() {
  const { run } = useRun();
  const { rules } = useWorkspace();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [scheduleError, setScheduleError] = useState('');

  const hasProduct = heroImages(run).length > 0;
  const productTitle = run.listing?.title ?? 'Uploaded product';

  useEffect(() => {
    if (!hasProduct) {
      setPosts(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            productId: run.listing?.url ?? 'uploads',
            productTitle,
            pinCount: run.volume,
            fanOut: run.fanOut,
            // Workspace rules from Connections drive the plan.
            rules: {
              windowStart: rules.windowStart,
              windowEnd: rules.windowEnd,
              maxPerNetworkPerDay: rules.maxPerNetworkPerDay,
            },
          }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (json.ok) {
          setPosts(json.posts);
          setScheduleError('');
        } else {
          setPosts(null);
          setScheduleError(json.message ?? 'Could not build a schedule from those rules.');
        }
      } catch {
        if (!cancelled) setPosts(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    hasProduct,
    run.listing?.url,
    run.volume,
    run.fanOut,
    productTitle,
    rules.windowStart,
    rules.windowEnd,
    rules.maxPerNetworkPerDay,
  ]);

  const byDate = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const p of posts ?? []) {
      const list = map.get(p.date) ?? [];
      list.push(p);
      map.set(p.date, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.time.localeCompare(b.time));
    return map;
  }, [posts]);

  // Display the month where the schedule mostly lives: the month of the
  // first post, rolled forward when the start sits in a month's last days.
  const today = new Date();
  const firstPost = posts?.[0]?.date;
  const anchor = firstPost ? new Date(`${firstPost}T00:00:00Z`) : today;
  if (firstPost && anchor.getUTCDate() > 25) anchor.setUTCDate(anchor.getUTCDate() + 7);
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();

  // Monday-start grid covering the whole month.
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(year, month, 1));
    const start = new Date(first);
    const weekday = (first.getUTCDay() + 6) % 7; // Mon=0
    start.setUTCDate(start.getUTCDate() - weekday);
    const out: { date: Date; inMonth: boolean }[] = [];
    const cursor = new Date(start);
    while (true) {
      out.push({ date: new Date(cursor), inMonth: cursor.getUTCMonth() === month });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      if (cursor.getUTCMonth() !== month && (cursor.getUTCDay() + 6) % 7 === 0 && out.length >= 28) break;
      if (out.length > 42) break;
    }
    return out;
  }, [year, month]);

  const lastDate = posts?.length ? posts[posts.length - 1].date : null;
  const monthEnd = iso(new Date(Date.UTC(year, month + 1, 0)));
  const activeNetworks: Network[] =
    run.fanOut === 'pinterest'
      ? ['pinterest']
      : run.fanOut === 'pinterest_facebook'
        ? ['pinterest', 'facebook']
        : ['pinterest', 'facebook', 'instagram'];
  const missingNetworks = (['pinterest', 'facebook', 'instagram'] as Network[]).filter(
    (n) => !activeNetworks.includes(n)
  );

  const gapMessage = !posts?.length
    ? null
    : missingNetworks.length
      ? `${missingNetworks.map((n) => n[0].toUpperCase() + n.slice(1)).join(' and ')} ${
          missingNetworks.length > 1 ? 'have' : 'has'
        } nothing scheduled — the run's fan-out is ${activeNetworks.length} network${
          activeNetworks.length > 1 ? 's' : ''
        }.`
      : lastDate && lastDate < monthEnd
        ? `The queue runs dry after ${MONTHS[month]} ${Number(lastDate.slice(8, 10))} — one more run covers the gap.`
        : null;

  if (!hasProduct) {
    return (
      <section className="page">
        <div className="page-kicker">Calendar</div>
        <h1>Nothing scheduled yet.</h1>
        <p className="page-lead">
          The cross-network month fills in when a run finishes: Pinterest, Facebook and Instagram
          posts for the same product on one grid, with gap detection and sync state.
        </p>
        <button className="btn btn-primary" type="button" onClick={() => navigate('/run/product')}>
          Start a run
        </button>
      </section>
    );
  }

  return (
    <section style={{ padding: '28px 32px 40px' }}>
      <div className="calendar-header">
        <div>
          <h1 className="calendar-h1">
            {MONTHS[month]} {year}
          </h1>
          <p className="calendar-summary">
            {run.volume} pins · {productTitle} · fanned to {activeNetworks.length} network
            {activeNetworks.length > 1 ? 's' : ''} — {posts?.length ?? 0} posts, all queued for
            Content360.
          </p>
          {scheduleError && <p className="calendar-gap">{scheduleError}</p>}
          {!scheduleError && gapMessage && <p className="calendar-gap">{gapMessage}</p>}
        </div>
        <div className="calendar-header-right">
          <div className="calendar-legend">
            <span>
              <span className="legend-square legend-pinterest" />
              Pinterest
            </span>
            <span>
              <span className="legend-square legend-facebook" />
              Facebook
            </span>
            <span>
              <span className="legend-square legend-instagram" />
              Instagram
            </span>
          </div>
          <button className="btn btn-primary" type="button" onClick={() => navigate('/run/product')}>
            Fill the gap
          </button>
        </div>
      </div>

      <div className="calendar-grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="calendar-weekday">
            {d}
          </div>
        ))}
        {cells.map(({ date, inMonth }) => {
          const key = iso(date);
          const dayPosts = byDate.get(key) ?? [];
          const isPast = key < iso(today);
          const isDry = inMonth && lastDate !== null && key > lastDate && !isPast;
          const muted = !inMonth || isDry;
          return (
            <div key={key} className={muted ? 'calendar-cell muted' : 'calendar-cell'}>
              <div className="calendar-date">
                <span>{WEEKDAYS[(date.getUTCDay() + 6) % 7]}</span>
                <span className="calendar-date-num">{date.getUTCDate()}</span>
              </div>
              {dayPosts.map((p) => (
                <div
                  key={p.id}
                  className={`post-chip post-${p.network}${p.state === 'failed' ? ' post-failed' : ''}`}
                  title={`Pin ${p.pinIndex} · ${p.state}`}
                >
                  {p.time.replace(/^0/, '')} {NETWORK_LABEL[p.network]}
                  {p.state === 'failed' && ' · failed'}
                </div>
              ))}
              {dayPosts.length === 0 && !inMonth && isPast && (
                <div className="post-chip post-published-marker">Published</div>
              )}
              {isDry && dayPosts.length === 0 && <div className="post-chip post-empty">Empty — no pins</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
