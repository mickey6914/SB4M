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
| `server/` | Fastify + TypeScript API server. Claude copywriting calls and (later) the job queue live here. |
| `design_handoff_pin_post_studio/` | The design handoff: spec, prototypes, design system, screenshots. Reference only — not shipped. |

## Running locally

```
npm install
npm run dev          # frontend on http://localhost:5173
npm run dev:server   # API on http://localhost:3001
```
