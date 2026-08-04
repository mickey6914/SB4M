# Product decisions

Answers to the open questions in `design_handoff_pin_post_studio/README.md`,
recorded 2026-07-30 from the stakeholder.

## 1. Brand structure

**Deals and Steals For Real** is the parent (the workspace). **Express Art Vibe**
is a shop under it, attached to the Etsy store. Build v1 single-shop, but tag
every run, pin and scheduled post with a shop id from day one, sized for up to
**3 shops**. The top-bar switcher stays a label until a second shop exists; the
data model never needs a migration to add one.

## 2. Facebook / Instagram captions

Reuse the Pinterest description on all networks. It must be manually shortenable
per network in the review inspector — one generated description, per-network
edits allowed. No separate caption generation pass.

## 3. Default Instagram fan-out crop

**4:5 feed.** 9:16 story/reel stays an optional crop, unchecked by default.

## 4. Multi-link runs (themed collections)

Wanted if not too complicated. It touches hero selection, per-pin destination
links and per-pin product descriptions, so: build the single-link run through
increment 7 first, then add collections as a follow-up increment on top of the
working loop. Not architected out: a run's schema keeps product references as a
list from the start.

## 5. Not-yet-built affordances in v1

Stakeholder will decide per screen when each is visible. To be re-raised at the
increment where each lives:

| Affordance | Decide during |
| --- | --- |
| Board pickers per network | **Built.** One board per workspace, chosen in Connections — see §8 |
| Pagination past six review cards | Increment 4 (review) |
| "Surprise me" scenes | Increment 2 (wizard) — trivial, included |
| "Show 50 more" scenes | Increment 2 — deferred, needs a scene catalog |
| "Refresh boards" | Increment 6 |
| "Retry failed" | Increment 7 (Content360 push) |
| Brand switcher menu | Deferred until a second shop exists (see #1) |

## 6. Chrome extension for blocked-marketplace ingestion

Agreed 2026-07-30: keep in the back pocket, sequenced after the core loop
(increments 4–7). A small extension running in the seller's own browser can
capture listing data from Etsy/Amazon pages that block server-side fetching —
free, reliable, and complementary to the official Etsy API. Decide between the
Etsy API and the extension (or both) when ingestion pain is real. An extension
does NOT help with AI calls, image generation, scheduling, or the Content360
push — those stay server-side, and programmatic Claude calls always need an
Anthropic API key regardless of any Claude subscription.

## 7. Image generation: hybrid, with a provider setting

Agreed 2026-07-31. The constraint is quality WITHOUT product alteration, so
full-AI mockups are ruled out: handing the product photo to a generative model
means it is redrawn, and no prompt makes that guarantee-able.

Hybrid instead: the image model generates only an EMPTY scene background; the
seller's real product photograph is composited on top by our own renderer and
never passes through a generative model, so its pixels cannot be altered.

Provider is a setting (SCENE_PROVIDER=google|openai|procedural), so switching
is an env change rather than a rebuild:

| Setting | Model (override with GOOGLE_IMAGE_MODEL / OPENAI_IMAGE_MODEL) | Key |
| --- | --- | --- |
| google | gemini-3.1-flash-image | GEMINI_API_KEY |
| openai | gpt-image-1-mini (~$0.005/image) | OPENAI_API_KEY |
| procedural | built-in gradient backdrop, no cost | none |

Three backgrounds per run, reused across its pins, so a run costs pennies.
"Nano Banana" is Google's Gemini image family — reachable by pointing
GOOGLE_IMAGE_MODEL at gemini-3-pro-image-preview et al. Consumer ChatGPT /
Gemini / Claude subscriptions do not cover programmatic calls; API keys do.
(That GOOGLE_IMAGE_MODEL override did not actually work when written — see the
amendment below.)

Escape hatch if the composite blend is not good enough on a product type
(mugs, apparel): swap this one step for a product-photography API such as
Claid or Photoroom. Nothing else in the pipeline changes.

### Amended 2026-08-04: Google moved, and providers are now swappable

Probing the live API with the seller's key found the original table's Google
row unreachable. Two separate things had changed:

1. **The imagen-\* family is closed to new accounts.** Every `:predict` model,
   including the `imagen-4.0-fast-generate-001` default above, answers 404
   *"no longer available to new users."* The Gemini image models that replaced
   them (`gemini-3.1-flash-image`, `gemini-3-pro-image-preview`) speak
   `:generateContent` instead — a different request body and a different place
   to find the image in the reply. The client now picks the protocol from the
   model name, so both work and the default is a model that exists. The old
   `imagen-*` names still route correctly for an older project that has them.
2. **Image generation is not in Google's free tier.** The key authenticates
   and lists models happily, then returns `limit: 0` quota errors for images
   until billing is enabled on its project. So a working key is not the same
   as a working feature here, and `.env.example` now says so.

The wider lesson is the durable one: a vendor retired a model family out from
under a hardcoded default, and fixing it needed a code change and a deploy.
So the OpenAI box is now an **OpenAI-compatible** box — `OPENAI_BASE_URL` points
it at any service that copies that API (Fal, Together, DeepInfra, Azure, a
local shim), making the next such break a config edit instead. The response
parser reads `b64_json`, which is what OpenAI itself returns; a vendor that
returns image *URLs* instead would need the small addition of a fetch step,
deliberately not built until something needs it.

`SCENE_PROVIDER=procedural` remains the always-works fallback, and the app
does not fall back to it silently — a configured provider that fails says so,
because a key that quietly does nothing is worse than an error.

**Untested against the live wire:** the `:generateContent` path is verified by
unit tests on the request body and response parsing, not against Google, since
the quota above rejects the call before the shape is ever evaluated. It stays
unproven end-to-end until billing is on.

## 8. Content360's real API

Probed against the live workspace on 2026-07-31 with the seller's key, which
settles the "short session together to match our field names" note that has
been sitting in `.env.example`. Everything below is measured, not assumed.

**Content360 is a white-labelled [Mixpost](https://mixpost.app) instance.** The
login page loads `/vendor/mixpost/assets/…`, and the API is Mixpost's, mounted
under the instance's `os` path:

```
https://app.content360.io/os/api/{workspace}/…    Authorization: Bearer <key>
```

The workspace id in the design spec (`34b00c5d-…`) is real and correct, and all
four accounts are connected and authorized: `pinterest`, `facebook_page` and two
`instagram_direct`. Note the provider slugs — Instagram is `instagram_direct`,
not `instagram`, and Facebook is `facebook_page`.

The whole API is four routes:

| Route | Methods |
| --- | --- |
| `/{workspace}/accounts` | GET |
| `/{workspace}/posts`, `/posts/{uuid}` | GET, POST, PUT, DELETE |
| `/{workspace}/media` | GET, POST, DELETE |
| `/{workspace}/tags` | GET, POST |

### What this changed

Four things we had guessed were wrong, and each one mattered:

1. **There is no bulk endpoint.** `POST /v1/posts/bulk` was invented; the real
   API creates one post per request. A batch is now N sequential POSTs. The UI
   contract is unchanged — the batch is still one push with one result — but a
   partial failure is now genuinely partial, so one rejected post no longer
   sinks the other 89.
2. **Media cannot be sent by URL.** `media: [{url}]` does not exist. Bytes are
   uploaded first as multipart (`POST /media`, field name `file`), and the post
   carries the returned media id. Our crops already arrive as `data:` URLs, so
   the renderer feeds the uploader directly. Distinct assets upload once and are
   shared by every post using them.
3. **A post is built from `versions`, not flat fields.** Caption, media and the
   per-network options all live inside `versions[].content[]` and
   `versions[].options`. Pinterest's board is keyed per account
   (`boards: {"account-132821": "<board id>"}`), and the option block name is
   the provider slug (`facebook_page`, not `facebook`).
4. **There is no `external_id`.** Our `localId` has no remote counterpart, so a
   pushed post is now tracked by the `uuid` Content360 returns. That is what
   makes `GET /posts/{uuid}` — and therefore real published/failed state on the
   dashboard — possible at all.

Two further constraints worth knowing:

- **Rate limit is 60 requests/minute** (`x-ratelimit-limit: 60`). A 30-pin run
  fanned out to three networks is 90 posts plus up to 90 uploads, so the client
  paces itself at ~54/min and backs off on a 429. A full run therefore takes a
  few minutes of wall clock — the push needs progress feedback, not a spinner.
- **The caption body is stored as HTML and is not escaped on the way in.** A
  description containing `&` or `<3` arrives as markup and is lost on publish,
  so the client escapes it. Newlines are left alone; Content360 turns them into
  the same blocks its own composer produces.

### Board pickers, built on that

Pinterest's boards come back on the `accounts` record — 22 of them, including
"Express Art Vibe". There is no separate boards route, so the increment-6 open
question "Refresh boards" is answered: it re-reads `accounts`, and that is
exactly what the button now does.

The picker sits in the Pinterest row on Connections and sets **one board for the
whole workspace**, not one per run. Pinterest is the only network whose
destination Content360 cannot infer, and a seller running one shop posts to one
board; a second shop (DECISIONS #1) gets its own. The choice persists with the
other workspace rules, and the board name is stored beside the id so the setting
still reads back when Content360 is unreachable.

Because Pinterest will not publish a pin without a board, Review shows a notice
when none is set. It does not block the push — Content360 accepts a boardless
post and holds it — but a silent hold is worse than a sentence saying so.

### Which account, when a network has two

Settled 2026-07-31: the workspace holds two Instagram accounts, and
**`dealsandstealsforreal` is the Express Art Vibe one** — not `laplace_social`.

Rather than bake that id into the push, a shop now names its own handle per
network (`handles` on the shop record), and Connections resolves it against the
live account list to seed the picker. That keeps the fact where shop facts live,
survives an account being reconnected under a new id, and extends to the second
and third shop DECISIONS #1 sizes for.

The picker itself only appears on a network with more than one connected
account — one account is not a choice, so that row just says who receives the
posts. A chosen account is sent with every post, and the server honours it
exactly: if it is no longer connected the post **fails with a message naming the
problem**, rather than falling back to another account. Publishing to the wrong
Instagram is precisely the surprise the picker exists to remove, so a silent
fallback would defeat it.

Boards belong to a Pinterest account, so switching the Pinterest account clears
the board rather than pointing a pin at a board the new account does not own.

### Correction: media is deleted on the collection, not the item

`DELETE /media/{id}` answers 405. Deletion is `DELETE /media` with
`{"items": [id, …]}` in the body — note `items`, not `ids`, which 422s. Posts
are the other way round: `DELETE /posts/{uuid}` per item. Found while cleaning
up after the run in §9.

### The plan's AI credits are not usable here

**No.** The lifetime plan advertises "AI Content Generation", but it is not
reachable from this API and not part of this product surface:

- No AI route exists on the API. Every candidate 404s while the four real routes
  answer, so this is absence, not a wrong guess at a name.
- The scheduling app's own frontend bundle has no AI feature at all — its
  complete route list is accounts, calendar, dashboard, inbox, link-in-bio,
  media, posts, profile, templates and webhooks. A grep for `openai`,
  `assistant`, `credits` or `generate` across the bundle returns nothing.

So copywriting stays on `ANTHROPIC_API_KEY` and the ~$0.25 per 30-pin run stands
— which is what §6 already predicted for programmatic Claude calls. Whatever AI
the plan includes lives in Content360's own composer UI, for a human typing into
it, and there is no API to spend those credits from.

## 9. The first end-to-end run

Run 2026-08-04 against live services, with `SCENE_PROVIDER=procedural` because
Google's image quota is still zero (§7). Every stage had passing unit tests
beforehand. Two of them were still broken, and both breaks were in the seams
between increments rather than inside any one of them — which is the argument
for doing this at all.

**What the run did:** ingested a real Shopify listing (5 images, price, clean
description), wrote copy with live Claude, composed three scene mockups,
rendered all four crops, computed a schedule, then pushed one pin fanned to all
three networks — real media upload, real post creation, real uuids, real status
read-back — and deleted all three posts and their uploads afterwards, so nothing
reached the seller's audience.

### Bug 1: the overlay was clipped, not fitted

SVG `<text>` neither wraps nor shrinks, and the type size was derived from the
bar width alone. The AI's 46-character title overflowed the viewport and was cut
off at both ends: `MEN'S ALLBIRDS FLIP FLOP IN ANTHRACITE COMFORT` rendered as
`S ALLBIRDS FLIP FLOP IN ANTHRACITE COM`. On every ratio.

The renderer now measures before it draws — shrinking the type to fit, and
truncating with an ellipsis only once shrinking hits a readability floor. The
old tests passed because they asserted the overlay *moved* per ratio and that
pixels *changed*; none asserted the words were still there. The new ones do.

### Bug 2: the scheduling engine drove the calendar and nothing else

Increment 6 built the workspace rules — the 09:00–17:00 window, the per-network
stagger, the daily caps, no same product twice on one network per day. Increment
7 built the push. Nothing connected them: `Review.tsx` set every post's time to
`Date.now() + (i + 1) days`, so the calendar showed one plan and the push sent
another. All three networks got an identical timestamp, at whatever hour the
seller happened to click the button.

Review now asks the engine for the same schedule the calendar renders and posts
at those times. If the schedule cannot be computed it refuses to push rather
than falling back to an invented time — the silent fallback is what hid this.

### Left standing, deliberately

- **A collection page ingests as a "listing".** Pointed at a category URL, the
  reader finds no product, falls back to page-level Open Graph, and returns
  `ok: true` with the site's name and its logo — which would produce thirty pins
  of a logo. The honest answer already exists (`not_product`); Open Graph
  fallback just needs to require something product-shaped before it claims one.
- **`ANTHROPIC_BASE_URL` silently redirects copywriting.** The SDK reads it from
  the environment, so a host that sets it for its own purposes takes over the
  app's Claude calls even though the key is passed explicitly. Harmless on the
  seller's machine, where nothing sets it. Pinning the base URL alongside the
  key would close it, the same way §7's key-name fix did.
- **Six posts scheduled for November 2027** sit in the workspace from the
  2026-07-31 probing session, carrying this app's exact 09:00/11:00/13:00
  stagger, plus three media uploads from the same session. Left alone: deleting
  a seller's posts is their call, not ours.
