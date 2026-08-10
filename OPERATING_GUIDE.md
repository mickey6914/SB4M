# Pin-Post Studio — operating guide

A reference for the whole app, screen by screen. If you want a first-time
walkthrough instead, read [`FIRST_RUN.md`](FIRST_RUN.md) — it's a path, this is
a map.

Your app lives at the URL Render gave you, behind the password in Render's
Environment tab. Any username works.

---

## What the app does

You paste one product link. The app pulls the listing's photos, asks four short
questions, and produces finished pins — AI-written titles, descriptions and
keywords, on photographic mockups, cropped for every network — then schedules
them and hands the batch to Content360, which does the actual publishing.

The loop is always the same five moves:

**Link → four questions → generate → review → push.**

Two rules hold everywhere in it:

- **Two mockup paths, and the app picks by template.** The ten named templates
  send your artwork to the model, which applies it to a t-shirt, mug or frame —
  this is what your shop uses. Any other scene name takes the older path, where
  the model draws only an empty backdrop and your photo is composited on top
  untouched. `DECISIONS.md` §7 and §11 cover why both exist.
- **Nothing publishes until you press one specific button.** Everything before
  `Push to Content360` is local and reversible.

---

## The screens

### Dashboard

Where you land. Three things live here:

- **Paste a product link** with a `Generate pins` button — you can start a run
  from here without going through the wizard.
- **Fan-out pattern** — which networks this run targets. Sets the default for
  every pin in the run; you can still change individual pins later.
- **Four counters** — pins this run, scheduled, pushed, assets rendered. These
  are the honest numbers. If a counter says 0, there are 0.

Below that, **Waiting on you** shows the current run's state and the Content360
sync panel, including **Retry failed** for posts that didn't make it.

### New run — step 1: Where's the product?

Paste an Etsy, Shopify or Amazon product link.

**Use a single product page.** A category or collection URL is a known problem
— see [Known limitations](#known-limitations).

**If the link fails**, use the drop-an-image fallback on the same screen and
pick photos from your computer. Etsy and Amazon block automated fetching, so
this is expected rather than a fault. The rest of the run works identically.

### New run — step 2: Pick the hero image

The listing's photos appear. Choose the one that leads the run. This is the
photo composited into every scene.

### New run — step 3: How many pins?

| Option | Pins | Takes |
| --- | --- | --- |
| Quick test | 3 | ~20 seconds |
| One week | 7 | ~40 seconds |
| One month | 30 | ~1m 50s |

Same screen, three more settings:

- **Style direction** — free text steering the look: "warm fall colours, no
  people". Quick-add suggestions: No people, Minimalist white, Fall colours,
  Bright & airy, Holiday.
- **A different mockup for every pin** — on by default. Off, pins sharing a
  template get the *identical* image, which Pinterest treats as spam. The
  screen shows the credit and time cost of whichever you pick:

  | Setting | 30-pin run | Runs/month on 20K credits |
  | --- | --- | --- |
  | On (default) | ~5,000 credits, a few minutes | ~4 |
  | Off | ~500 credits, seconds | ~40 |

  Off is fine for a quick test. On is what you want for a real schedule.
- **Fan-out** — Pinterest only, Pinterest + Facebook, or all three networks.
- **Crops** — which sizes to render:

| Crop | For |
| --- | --- |
| 2:3 | Pinterest pin |
| 1:1 | Facebook post |
| 4:5 | Instagram feed *(the Instagram default)* |
| 9:16 | Story / reel *(off by default)* |

### New run — step 4: Choose three mockup templates

Ten templates, each applying your artwork to a product:

| Template | What it produces |
| --- | --- |
| T-shirt · Sweatshirt | Worn outdoors, autumn park, friends |
| T-shirt flat lay · Sweatshirt flat lay | Garment laid flat, shot straight down |
| Coffee cup | Held close at a kitchen table |
| Pillow | On a linen sofa in a sunlit room |
| Invitation card | Standing on a table with a kraft envelope |
| Wall art | Framed on a beige gallery wall |
| TV wall art | On a smart TV in a minimalist living room |
| Tote bag | Carried at an autumn farmers market |
| Sticker sheet | Die-cut sheet, overhead, charcoal background |
| Planner stickers | Peeled and stuck into an open planner |

**Surprise me** picks three at random.

How many images actually get generated is your choice, on the previous step —
see "A different mockup for every pin" below.

Each pin varies its own shot — camera angle, lighting and what else is in the
room — so a run of thirty does not read as three pictures repeated. Flat lays
and sticker sheets keep their overhead camera and vary the surface instead.

Every template generates at **2:3**, Pinterest's native pin. That is not
cosmetic: all four crops are portrait or square, so a landscape mockup loses
most of its width to every one of them. Each prompt also asks for the product
close, centred and with margin on all sides, so re-cropping trims background
rather than the product.

Your artwork is sent to the image model, which applies it to the product. That
is the opposite of how physical-product staging works in this app, and the
reasoning is in `DECISIONS.md` §11 — worth reading once. The practical
consequence: check that intricate line work survives, because a model touching
the art *can* alter it.

### New run — step 5: Progress

The run executes: copy written, mockups generated, your artwork applied,
every crop rendered. Watch or walk away.

### Review

The screen that matters, and still completely safe — nothing has left your
computer except the AI calls.

**Every card has an Include checkbox.** Tick the pins you want; only ticked
pins are pushed. Approval is per pin, not a count — rejecting one no longer
lets it through, and approving a later one no longer leaves it behind.

Each pin has an inspector:

- **Destination link** — where the pin sends a click. Seeded from the run's
  listing URL, and blank on an upload-based run, so set it here. **Use this
  link for every pin** copies it across the batch. It reaches every network,
  but not the same way: Pinterest carries it as the pin's real destination
  field, while Facebook and Instagram have no such field, so it is appended to
  the caption — clickable on Facebook, visible but not clickable on Instagram,
  which never makes caption URLs clickable
- Edit **title**, **description** and **overlay text** by hand
- Set the overlay's **position** (top / middle / bottom) and **size** (small /
  medium / large). Small is the original bar, medium the default; large is
  worth trying if the brand mark disappears in a Pinterest feed. The four crops
  re-render as you change it
- **Rewrite with AI** if the copy isn't right
- **Approve pin** / **Reject**

Across the batch:

- **Approve all** ticks everything; **Clear all** unticks everything
- The counter reads `N approved · N flagged`
- **Show more** pages through beyond the first six cards
- **Push to Content360** — stays disabled until at least one pin is approved

If no Pinterest board is set, Review shows a notice with a **Choose a board**
link. The push still works, but Pinterest can't publish without one, so the
posts would sit held.

**Expired accounts are flagged before you push.** Social tokens expire on a
schedule — Instagram's roughly every 60 days — and an expired one fails at
publish time, days after a push that looked fine. Review checks the accounts
this run will post to and names any that need reconnecting, so you find out
before scheduling rather than afterwards. Reconnect in Content360 under
Configuration → Social Accounts.

### Calendar

The cross-network schedule — when each post goes out, on which network. Reads
"Nothing scheduled yet" until a run is scheduled. What you see here is what
gets pushed; the two can't disagree.

### Library

Past runs. Each keeps its **recipe** — the link, hero, volume, style direction,
scenes, fan-out and crops — and **Duplicate** starts a fresh run from it. This
is how you re-run a product seasonally without re-answering everything.

### Connections

Settings, and the first place to check when something isn't working.

**Services** — three status rows:

| Row | Healthy reads |
| --- | --- |
| Content360 push | "Key set" |
| Scene backgrounds | "Abacus (RouteLLM)" |
| — | See [Troubleshooting](#troubleshooting) for the others |

**Accounts** — the networks Content360 owns. Where a network has more than one
connected account, a picker appears; where it has one, the row just names who
receives the posts. Your Instagram is `dealsandstealsforreal`.

**Pinterest board** — one board for the whole workspace. Switching the
Pinterest account clears the board, because a board belongs to an account.

**Workspace rules** — set once, applied to every run:

| Rule | Default | What it does |
| --- | --- | --- |
| Remind me when a description has no #ad | On | A reminder only. The app never writes #ad into your copy and never blocks a push — it tells you which descriptions lack it, and you decide which pins need one |
| Only post between set hours | On, 09:00–17:00 | The posting window |
| No same product twice on one network per day | On | Prevents self-spam |
| Require approval before pushing | Off | Extra gate before the push |
| Max posts per network per day | 3 | Daily cap |
| Default overlay text | EXPRESS ART VIBE | Pre-filled on each pin |

---

## The push, and what happens after

`Push to Content360` is the only irreversible action. When you press it:

- Posts are created **one at a time** — there's no bulk endpoint — so a large
  batch takes a few minutes of real time and shows progress.
- Each post carries the **schedule the calendar showed you**. If the schedule
  can't be computed, the push refuses rather than inventing a time.
- Media uploads once and is shared by every post using it.
- **A partial failure is genuinely partial.** One rejected post doesn't sink
  the rest, and **Retry failed** on the Dashboard picks up the stragglers.
- Content360 returns a `uuid` per post, which is how the Dashboard reads back
  real published/failed state later.

**To undo a push**, delete the posts in Content360 before their publish time.
The app doesn't delete them for you.

---

## What things cost

| Thing | Cost |
| --- | --- |
| AI copywriting | ~$0.25 per 30-pin run (Anthropic) |
| Scene backgrounds | Abacus ChatLLM credits — 3 images per run, regardless of pin count |
| Content360 push | Nothing beyond your existing plan |
| Hosting | Free tier |

The per-image credit draw hasn't been pinned down — Abacus reports it in
"compute points", which aren't the same unit as your plan's credits, and there's
no API for the balance. **Check your Abacus billing page** after a couple of
runs to see the real number.

---

## Known limitations

Honest list. These are known, not things you've broken.

- **A collection or category URL is treated as a product.** The reader finds no
  product, falls back to the page's own metadata, and returns the shop's name
  and logo — which becomes a run full of logo pins. Use single product pages.
- **Etsy and Amazon block automated fetching.** Use the upload fallback.
- **The free Render instance sleeps** after ~15 minutes idle; the next visit
  takes 30–60 seconds to wake. Not a fault.
- **"Keyword flagged" is not a real check yet.** It currently marks every fifth
  pin regardless of content — a leftover from the design mockup. Ignore it.
- **"Run 15" is a fixed label**, not a real run number.
- **Six posts dated November 2027** sit in the Content360 workspace from an
  early testing session. Harmless, and deliberately left alone — deleting a
  seller's posts isn't the app's call.

---

## Troubleshooting

| What you see | What it means |
| --- | --- |
| Browser keeps asking for the password | Wrong password — check `APP_PASSWORD` in Render → Environment |
| Scene backgrounds: "Setting not recognised" | `SCENE_PROVIDER` is misspelt; it should be `abacus` |
| Scene backgrounds: "Built-in backdrops (no key yet)" | Render can't see `ABACUS_API_KEY` |
| Content360 push: "No key yet" | `CONTENT360_API_KEY` missing |
| "Rewrite with AI" says the key is missing | `PIN_POST_ANTHROPIC_KEY` missing |
| First load takes ~50 seconds | Free instance waking from sleep |
| App won't start at all | Almost always a missing `APP_PASSWORD` — Render's Logs tab says so plainly |

**Changing any key** means editing it in Render → Environment and redeploying —
never in a file.

**Nothing is ever silently substituted.** If a setting names something the app
doesn't recognise, it stops and says so rather than quietly using something
else. A blank screen or an error message is the app being honest, not broken.

---

## Where the reasoning lives

Every product decision and the evidence behind it —why the hybrid image
approach, how Content360's API actually works, what the Abacus verification
found, what the first end-to-end run broke — is recorded in
[`DECISIONS.md`](DECISIONS.md).
