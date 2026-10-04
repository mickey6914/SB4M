// Turning reviewed pins into Content360 posts. Pure — no React, no fetch — so
// the rule that broke in testing is pinned down by a test (web/test/posts.test.ts).
//
// What broke: one image, three pins, three networks — nine posts, and six of
// them went out image-only. Only the pin the seller had edited carried a
// caption; untouched pins pushed an empty body. Now every pin is seeded with
// the run's copy, every post is built from ITS OWN pin's title, description
// and tags, and an included pin with no copy stops the push before anything
// is sent.

export type Network = 'pinterest' | 'facebook' | 'instagram';

export type Tag = { text: string; on: boolean };

export type CopyFields = { title: string; desc: string; keywords: Tag[] };

export type PostablePin = CopyFields & { link: string; approved: boolean };

export type RunCopyResult = { titles: string[]; description: string; tags: string[] };

// How many tags the copywriter writes for a run.
export const TAG_TOTAL = 13;

export const NETWORK_CROP = { pinterest: '2:3', facebook: '1:1', instagram: '4:5' } as const;

// Pinterest refuses descriptions over 500 characters.
export const PINTEREST_DESC_MAX = 500;

// Pin 1 takes title 1, pin 2 title 2, pin 3 title 3, and round again for runs
// over three. Every pin gets the description and all thirteen tags, ticked.
export function copyForPin(copy: RunCopyResult, index: number): CopyFields {
  return {
    title: copy.titles.length ? copy.titles[index % copy.titles.length] : '',
    desc: copy.description,
    keywords: copy.tags.map((text) => ({ text, on: true })),
  };
}

export function hashtag(tag: string): string {
  const word = tag.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  return word ? `#${word}` : '';
}

function hashtags(tags: Tag[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    if (!t.on) continue;
    const h = hashtag(t.text);
    if (h && !out.includes(h)) out.push(h);
  }
  return out;
}

function truncateWords(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

// The body of one post.
//
// Pinterest carries the title and the destination as fields of their own, so
// its body is the description plus as many tags as fit under Pinterest's
// 500-character limit — a post over it is rejected outright.
//
// Facebook and Instagram have no title or link field: the only way a viewer
// sees either is in the caption, so the title leads and the link closes it.
// Facebook makes the bare URL clickable; Instagram never does, but the
// address is still there to copy.
export function captionFor(pin: CopyFields & { link: string }, network: Network): string {
  const desc = pin.desc.trim();
  const tags = hashtags(pin.keywords);

  if (network === 'pinterest') {
    let body = truncateWords(desc, PINTEREST_DESC_MAX);
    const kept: string[] = [];
    for (const tag of tags) {
      const next = `${body}\n\n${[...kept, tag].join(' ')}`;
      if (next.length > PINTEREST_DESC_MAX) break;
      kept.push(tag);
    }
    if (kept.length) body = `${body}\n\n${kept.join(' ')}`;
    return body;
  }

  const link = pin.link.trim();
  return [
    pin.title.trim(),
    desc,
    tags.join(' '),
    link && !desc.includes(link) ? link : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

// 1-based numbers of included pins that would go out without copy.
export function pinsMissingCopy(pins: PostablePin[]): number[] {
  return pins
    .map((p, i) => ({ p, n: i + 1 }))
    .filter(({ p }) => p.approved && (!p.title.trim() || !p.desc.trim()))
    .map(({ n }) => n);
}

export function missingCopyMessage(pinNumbers: number[]): string {
  return `Pin ${pinNumbers.join(', ')} ${
    pinNumbers.length > 1 ? 'have' : 'has'
  } no title or description. Every post needs copy before it goes to Content360.`;
}

export type OutgoingPost = {
  localId: string;
  network: Network;
  scheduledAt: string;
  caption: string;
  assetUrl: string;
  accountId?: number;
  pinterest?: { title: string; link: string; board?: string };
  facebook?: { postType: 'post' };
};

export type BuildPostsInput = {
  runId: string;
  pins: PostablePin[];
  networks: readonly Network[];
  // `${i}#${network}` → ISO time, where i is the 1-based position among the
  // INCLUDED pins (the schedule engine is asked for exactly those).
  slots: Map<string, string>;
  // 1-based pin number → crop → asset URL.
  assets: Map<number, Record<string, string>>;
  accountByNetwork?: Partial<Record<Network, { id: number }>>;
  board?: string;
};

// One post per included pin per network — never more, never fewer — each
// carrying its own pin's copy and picture.
export function buildPosts(input: BuildPostsInput): OutgoingPost[] {
  const included = input.pins.map((pin, i) => ({ pin, n: i + 1 })).filter(({ pin }) => pin.approved);
  return included.flatMap(({ pin, n }, i) =>
    input.networks.map((network) => ({
      localId: `${input.runId}#${n}#${network}`,
      network,
      scheduledAt: input.slots.get(`${i + 1}#${network}`) ?? '',
      caption: captionFor(pin, network),
      assetUrl: input.assets.get(n)?.[NETWORK_CROP[network]] ?? '',
      ...(input.accountByNetwork?.[network] ? { accountId: input.accountByNetwork[network]!.id } : {}),
      ...(network === 'pinterest'
        ? {
            pinterest: {
              title: pin.title.trim(),
              link: pin.link,
              ...(input.board ? { board: input.board } : {}),
            },
          }
        : {}),
      ...(network === 'facebook' ? { facebook: { postType: 'post' as const } } : {}),
    }))
  );
}

export function networksFor(fanOut: 'pinterest' | 'pinterest_facebook' | 'all'): Network[] {
  return fanOut === 'pinterest'
    ? ['pinterest']
    : fanOut === 'pinterest_facebook'
      ? ['pinterest', 'facebook']
      : ['pinterest', 'facebook', 'instagram'];
}

const NETWORK_NAMES: Record<Network, string> = {
  pinterest: 'Pinterest',
  facebook: 'Facebook',
  instagram: 'Instagram',
};

function listNames(networks: readonly Network[]): string {
  const names = networks.map((n) => NETWORK_NAMES[n]);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// "3 pins pushed to Content360: 9 posts queued across Pinterest, Facebook and Instagram."
export function pushSummary(pinCount: number, networks: readonly Network[]): string {
  return `${pinCount} pin${pinCount === 1 ? '' : 's'} pushed to Content360: ${
    pinCount * networks.length
  } post${pinCount * networks.length === 1 ? '' : 's'} queued across ${listNames(networks)}.`;
}
