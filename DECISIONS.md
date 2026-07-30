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
