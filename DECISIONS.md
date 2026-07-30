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
| Board pickers per network | Increment 6 (scheduling) — required for a real Pinterest push |
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
| google | imagen-4.0-fast-generate-001 (~$0.02/image) | GEMINI_API_KEY |
| openai | gpt-image-1-mini (~$0.005/image) | OPENAI_API_KEY |
| procedural | built-in gradient backdrop, no cost | none |

Three backgrounds per run, reused across its pins, so a run costs pennies.
"Nano Banana" is Google's Gemini image family — reachable by pointing
GOOGLE_IMAGE_MODEL at gemini-3-pro-image-preview et al. Consumer ChatGPT /
Gemini / Claude subscriptions do not cover programmatic calls; API keys do.

Escape hatch if the composite blend is not good enough on a product type
(mugs, apparel): swap this one step for a product-photography API such as
Claid or Photoroom. Nothing else in the pipeline changes.
