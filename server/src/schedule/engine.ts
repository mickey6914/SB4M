// Scheduling engine — the workspace rules from the handoff, as pure logic:
//   - only schedule between 09:00 and 17:00
//   - never place the same product twice on one network on one day
//   - max posts per network per day (default 3)
//   - fan-out pattern decides which networks each pin reaches
// Fanned-out posts land on the same day at staggered times; the same-product
// rule therefore paces one run at one pin per network per day.

export type Network = 'pinterest' | 'facebook' | 'instagram';
export type FanOut = 'pinterest' | 'pinterest_facebook' | 'all';
export type PostState = 'queued' | 'pushed' | 'published' | 'failed';

export type ScheduledPost = {
  id: string;
  productId: string;
  productTitle: string;
  pinIndex: number; // 1-based
  network: Network;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  state: PostState;
};

export type WorkspaceRules = {
  windowStart: number; // hour, inclusive
  windowEnd: number; // hour, inclusive
  maxPerNetworkPerDay: number;
};

export const DEFAULT_RULES: WorkspaceRules = {
  windowStart: 9,
  windowEnd: 17,
  maxPerNetworkPerDay: 3,
};

// Staggered slots per network, from the design's calendar chips. All inside
// the 09:00–17:00 window.
export const NETWORK_TIMES: Record<Network, string> = {
  pinterest: '09:00',
  instagram: '11:00',
  facebook: '13:00',
};

export function networksFor(fanOut: FanOut): Network[] {
  if (fanOut === 'pinterest') return ['pinterest'];
  if (fanOut === 'pinterest_facebook') return ['pinterest', 'facebook'];
  return ['pinterest', 'facebook', 'instagram'];
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Whether a description carries #ad. Once a hard gate — a push was refused
// unless every description had it — now only a reminder the seller acts on,
// because whether a given pin needs a disclosure is a judgement about that
// pin. See DECISIONS.md §13. The check
// lives here with the other rules.
export function adCompliant(description: string): boolean {
  return /(^|\s)#ad(\s|$)/i.test(description);
}

export type ScheduleInput = {
  productId: string;
  productTitle: string;
  pinCount: number;
  fanOut: FanOut;
  startDate: string; // YYYY-MM-DD
  rules?: WorkspaceRules;
  existing?: ScheduledPost[]; // other products already on the calendar
};

export function scheduleRun(input: ScheduleInput): ScheduledPost[] {
  const rules = input.rules ?? DEFAULT_RULES;
  const networks = networksFor(input.fanOut);

  // Sanity-check the slot times against the window; a misconfigured window
  // yields no valid slots rather than off-window posts.
  for (const network of networks) {
    const hour = Number(NETWORK_TIMES[network].slice(0, 2));
    if (hour < rules.windowStart || hour > rules.windowEnd) {
      throw new Error(`slot for ${network} falls outside the posting window`);
    }
  }

  // Occupancy from posts already scheduled (other runs/products).
  const perNetworkDay = new Map<string, number>();
  const productNetworkDay = new Set<string>();
  for (const post of input.existing ?? []) {
    const key = `${post.network}|${post.date}`;
    perNetworkDay.set(key, (perNetworkDay.get(key) ?? 0) + 1);
    productNetworkDay.add(`${post.productId}|${key}`);
  }

  const posts: ScheduledPost[] = [];
  let day = input.startDate;

  for (let i = 0; i < input.pinCount; i++) {
    // Find the first day where every fanned-out network can take this
    // product: not already carrying it that day, and under the daily cap.
    for (let guard = 0; guard < 3660; guard++) {
      const fits = networks.every((network) => {
        const key = `${network}|${day}`;
        if (productNetworkDay.has(`${input.productId}|${key}`)) return false;
        return (perNetworkDay.get(key) ?? 0) < rules.maxPerNetworkPerDay;
      });
      if (fits) break;
      day = addDays(day, 1);
    }

    for (const network of networks) {
      const key = `${network}|${day}`;
      perNetworkDay.set(key, (perNetworkDay.get(key) ?? 0) + 1);
      productNetworkDay.add(`${input.productId}|${key}`);
      posts.push({
        id: `${input.productId}#${i + 1}#${network}`,
        productId: input.productId,
        productTitle: input.productTitle,
        pinIndex: i + 1,
        network,
        date: day,
        time: NETWORK_TIMES[network],
        state: 'queued',
      });
    }
    // Same product can't repeat on these networks until the next day.
    day = addDays(day, 1);
  }

  return posts;
}
