# Prompt for Claude Code

Copy everything below the line into Claude Code, in a directory containing the
unzipped `design_handoff_pin_post_studio/` folder.

---

I'm building a web app called **Express Art Vibe Pin-Post Studio**. The complete design
specification is in `design_handoff_pin_post_studio/`. Start by reading
`design_handoff_pin_post_studio/README.md` in full — it specifies all ten screens down to type
sizes, colors, spacing, interaction rules, state shape, and the third-party integration contract.
Then open the two `.dc.html` files in that folder to see the actual designs, and look at
`screenshots/` for one capture per screen.

## What the app does

A seller pastes one product listing URL (Etsy, Shopify, Amazon). The app pulls the listing's
images, asks four short questions (hero image, how many pins, style direction, three inspiration
scenes), generates that many pin mockups with AI-written titles, SEO descriptions and keyword
sets, re-crops each approved pin for other networks (2:3 Pinterest, 1:1 Facebook, 4:5 Instagram
feed, 9:16 story), and pushes the finished batch into the user's existing **Content360**
workspace, which owns the social accounts and does the publishing. The product's differentiator
is a single cross-network calendar showing Pinterest, Facebook and Instagram posts for the same
product on one month grid, with gap detection and per-post sync state.

## Important: the HTML files are design references, not code to port

The `.dc.html` files are prototypes showing intended look and behavior. They use a custom
template/state runtime (`support.js`) and a drag-and-drop placeholder element (`image-slot.js`)
that exist only so a non-developer could review the design. **Do not port either file, and do not
copy the prototype's markup structure.** Recreate the designs properly in the stack we choose.

The design system in `_ds/modernist-…/` is different — that IS the visual source of truth.
`styles.css` carries every token (colors, type, spacing, the deliberate zero border-radius) and
component class; `readme.md` is its written guide. Consume those tokens; don't hard-code values
the tokens already carry, and don't invent colors or type.

## Fidelity

High fidelity. Colors, typography, spacing, 2px rules and interaction states are final —
implement them faithfully. All *data* in the prototype (listing details, pin copy, calendar
entries, sync states) is illustrative and should come from real sources.

## Stack

There's no codebase yet, so propose one before writing code. My constraints:

- The AI copywriting must run server-side with an Anthropic API key. A Claude subscription does
  not cover programmatic calls, so the key and its billing need to be part of the plan.
- Long-running image generation means jobs need a queue and real progress reporting, not a fake
  progress bar. The prototype fakes it; the four named stages in the progress screen should
  reflect actual job stages.
- Content360's API accepts post creation, so pushing a batch is a real POST, not a CSV export.
- Desktop web first. A mobile companion (read-only calendar, swipe approve/reject on review) may
  come later — don't build it, but don't architect it out.

Tell me what you'd pick and why before you start.

## Build order

Please work in these increments, stopping after each so I can look at it:

1. **Scaffold + design system.** Project skeleton, the Modernist tokens wired in, the app shell:
   236px left sidebar with its six destinations and the active-state treatment, plus routing.
   Static content is fine.
2. **The run wizard**, screens 1–5 of the README (product → hero image → volume → scenes →
   progress). Real client state, real navigation, the selection rules from the README (hero is
   single-select; scenes are multi-select capped at three, FIFO; volume drives downstream counts).
   Listing ingestion can be stubbed at this stage.
3. **Listing ingestion.** Given a URL, fetch the product's images and text. Tell me the tradeoffs
   between official APIs and scraping before you build it, including what breaks when a seller
   pastes a link from a marketplace we haven't handled.
4. **Review screen**, README section 7 — the four-up crop preview panel, the pin grid with crop
   tabs, and the inspector. Then wire the real Claude call for titles, descriptions and keywords;
   the exact prompt contract and JSON shape are in the README under "AI copywriting". Handle
   failure inline, never throw.
5. **Crop rendering.** Generate the four aspect ratios from one mockup with the text overlay
   re-placed per ratio rather than sliced. This is the differentiator — get it right.
6. **Scheduling + calendar.** The workspace rules from the README (#ad enforcement, 09:00–17:00
   window, no same product twice on one network per day, max posts per network per day), the fan-out
   patterns, then the month grid with network color coding, gap detection and sync badges.
7. **Content360 push.** The batch POST, the queued → pushed → published → failed state machine, and
   the sync surfaces on the dashboard and calendar.

Image generation for the mockups is the expensive part and needs an image model, not Claude —
flag the cost implications when we get to step 5, and suggest options.

## Ground rules

- Ask me before adding screens, features or copy that aren't in the README. The design is
  deliberately narrow; the prototype's scope creep risks are listed under "Not yet built".
- Where the README lists an open question, ask me rather than picking for me.
- Don't rebuild what Content360 owns: account auth, publishing, retries, inbox, link-in-bio,
  media library.
- Copy in the designs is intentional. Carry it across verbatim unless you flag a reason not to.
