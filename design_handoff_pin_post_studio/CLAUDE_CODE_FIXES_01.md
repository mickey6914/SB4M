# Pin-Post Studio — Fix batch 01

Paste this into Claude Code in the Pin-Post Studio repo. Fix all three issues, then run a 1-image / 3-pin test run end to end and confirm the Content360 result.

---

## 1. Auto-generate listing copy from the product image

Right now title, description and keywords are blank until the user types them or clicks "Rewrite with AI". They should be written automatically as soon as the hero image is confirmed in New run, before the run reaches Review.

**When:** immediately after the hero image step is confirmed (run in parallel with mockup rendering). Show it as a row on the Generating screen: "Writing titles, description + 13 tags".

**How:** send the hero image (vision input) plus the product type to Claude. Use this prompt verbatim as the instruction, with `{product_type}` filled from the run (default: "acrylic faux stained glass wall art"):

> Act as an Etsy Product Listing Specialist and provide 3 seo keyword optimized title suggestions based on the product style and design, and not the current title for this product; a product description, and 13 tags that will attract buyers for this {product_type} design.

Append a format instruction so the result parses:

```
Return only JSON: {"titles": [3 strings], "description": string, "tags": [13 strings]}.
Tags: lowercase, max 20 characters each. Titles: max 100 characters.
```

Store the prompt as an editable workspace setting (Connections → Workspace rules → "Copywriting prompt") so it can be changed without a deploy.

**Apply to every pin in the run, not just the selected one:**
- Pin 1 gets title 1, pin 2 gets title 2, pin 3 gets title 3 (cycle for runs over 3 pins).
- All pins get the description and the 13 tags.
- Workspace #ad rule still applies on top.

**Review panel changes:**
- Under Title, show the 3 suggestions as clickable options; clicking one fills the field. Field stays editable.
- Keywords → rename "Tags", list all 13 with checkboxes (all on by default). Remove the "drafts five" empty state.
- "Rewrite with AI" re-runs the same prompt for the selected pin only.

## 2. Push sent 6 of 9 posts with no caption

Test: 1 image → 3 pins → 3 networks = 9 posts in Content360. Only pin 1's three posts had text; pins 2 and 3 (6 posts) went out image-only. Cause: the caption is only populated on a pin the user edited/rewrote; untouched pins push an empty `content`.

Fix:
- Build each post's `content` from **its own pin's** title + description + tags (+ destination link appended for Facebook/Instagram, as the review panel already describes).
- Issue 1 makes every pin have copy by default; keep that as the source of truth.
- Validation: block "Push to Content360" if any included post has an empty caption, and list which pins are missing copy.
- Add a test: a 3-pin run with no manual edits produces 9 payloads, all with non-empty `content`.

## 3. Overlay text on pin 1 renders as tiny compressed text

On the selected/first pin the overlay bar shows a microscopic, unreadable line of text in all four crop previews and the grid tile, while pins 2 and 3 render "EXPRESS ART VIBE" correctly at Medium. Likely the font size is computed from the crop's width before the image has loaded (width ≈ 0), or the Small/Medium/Large value isn't initialised for the first pin. Compute size from the rendered container after load (ResizeObserver) with a minimum, and make sure every pin starts with the default size. Verify the exported image matches the preview.

## 4. Check the Include checkboxes

In the test, every Include box in the grid was unchecked, yet all 3 pins were pushed. Confirm what Include means (pin goes in the push) and make the push respect it. Default: checked after Approve.
