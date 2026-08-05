# Express Art Vibe Pin-Post Studio

A Pinterest-first pin factory that feeds Content360. A seller pastes one product
listing URL; the app pulls the listing's images, asks four short questions,
generates pin mockups with AI-written titles, SEO descriptions and keyword sets,
re-crops each approved pin for other networks (2:3 / 1:1 / 4:5 / 9:16), and pushes
the finished batch into the seller's Content360 workspace.

The complete design specification lives in
[`design_handoff_pin_post_studio/`](design_handoff_pin_post_studio/README.md).

## Layout

| Directory | What it is |
| --- | --- |
| `web/` | React + Vite + TypeScript frontend. Styling is plain CSS on the Modernist design-system tokens. |
| `server/` | Fastify + TypeScript API server: listing ingestion, Claude copywriting, crop rendering, scene mockups, scheduling, and the Content360 push. |
| `design_handoff_pin_post_studio/` | The design handoff: spec, prototypes, design system, screenshots. Reference only — not shipped. |

Product decisions and their reasoning are recorded in [`DECISIONS.md`](DECISIONS.md).

New here? [`FIRST_RUN.md`](FIRST_RUN.md) covers getting the app online and then
walks through it end to end, marking the point where a run stops being
reversible.

## Deploying it

One service, one URL: the API server also serves the built frontend, so there
is no separate frontend host and no base-URL setting anywhere. `Dockerfile`
builds it; `render.yaml` is a Render blueprint that asks for the keys and
nothing else. Any host that runs a container works the same way.

`APP_PASSWORD` puts the whole app behind one password, and in production the
server **refuses to start without it** — anyone reaching the URL could
otherwise spend the API credits and post to the seller's real accounts.

## Running locally

```
npm install
npm run dev          # frontend on http://localhost:5173
npm run dev:server   # API on http://localhost:3001
npm test --workspace server   # 65 tests
```

## API keys (all optional)

The app runs with no keys at all — each key switches one feature from an
honest "not configured" message to working. Copy the template and fill in
whichever you have:

```
cp server/.env.example server/.env
```

Then edit `server/.env`. It is git-ignored, so keys never reach GitHub.
Every setting is documented in the template itself; in short:

| Feature | Key | Roughly costs |
| --- | --- | --- |
| AI copywriting | `ANTHROPIC_API_KEY` | $0.25 per 30-pin run |
| Scene backgrounds | `ABACUS_API_KEY` (or `OPENAI_API_KEY` / `GEMINI_API_KEY`, + `SCENE_PROVIDER`) | pennies per run |
| Content360 push | `CONTENT360_API_KEY` | included in your plan |

Content360's plan includes its own AI content generation, but it is only
available inside Content360's composer — there is no API for it, so this app's
copywriting runs on `ANTHROPIC_API_KEY`. The Content360 API shape we push
against is documented in [`DECISIONS.md`](DECISIONS.md) §8.

The seller's product photograph is never sent to an image model — providers
generate an empty background only, and the real photo is composited on top.
