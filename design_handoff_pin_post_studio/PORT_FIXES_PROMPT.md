# Paste into Claude Code (repo: mickey6914/SB4M)

The design prototype `design_handoff_pin_post_studio/Express Art Vibe - Dashboard.dc.html` was updated after seller testing. Port these behaviours into the real app. Read the prototype for exact copy and layout. Keep existing tests passing and add tests for the server changes. Commit to `main` so Render redeploys.

## 1. Copy writes itself (server/src/copywrite/index.ts)
- Replace the 1-title / 5-keyword contract with: **3 title suggestions, 1 description, 13 tags**. Response JSON: `{"titles":[3],"description":"...","tags":[13]}`. Update `parsePinCopy` and its tests.
- Use the seller's prompt as the default, stored per workspace and editable on Connections:
  > Act as an Etsy Product Listing Specialist and provide 3 seo keyword optimized title suggestions based on the product style and design, and not the current title for this product; a product description, and 13 tags that will attract buyers for this {product_type} design.
- Add a workspace "Product type" field (default `acrylic faux stained glass wall art`) that fills `{product_type}`.
- Send the hero product image to Claude (vision) along with the product text, so copy is based on the design itself.
- Run copywriting automatically during the Generating step for the whole run. The seller should never have to type a title or description.

## 2. Review (web/src/routes/Review.tsx)
- Spread the 3 titles across pins (pin 1 → title 1, and so on). Show all 3 as click-to-use suggestions under the Title field.
- Show the 13 tags as a 2-column checklist with real toggles ("Tags · N of 13").
- Each pin card gets an **Include** checkbox (top-left of the image). Only included pins are pushed. Approve all ticks every pin.
- Show the "Keyword flagged" badge above the overlay band so it doesn't cover the checkbox.
- Show the brand overlay band on every card. Under each title, show "{mockup type} · {scene}".

## 3. Push = one post per pin per network (bug)
- Testing produced 3 posts with text plus 6 image-only posts. Every pushed post must carry its pin's title, description, tags and image.
- Block the push and show the pin numbers when any included pin is missing a title or description.
- Confirmation text: "N pins pushed to Content360: N×3 posts queued across Pinterest, Facebook and Instagram."

## 4. Wizard
- Product step: add a **Continue with uploaded photos** button below the upload tiles → Hero step.
- Hero step: show only the photos the seller uploaded (not listing images or stale ones). Photo 1 is preselected and empty tiles are ignored.
- Scenes step: add a **Mockup** picker above the scenes: T-shirt, Sweatshirt, T-shirt flat lay, Sweatshirt flat lay, Coffee cup, Pillow, Invitation card, Wall art, TV wall art, Tote bag, Sticker sheet, Planner stickers. Pass it to scene generation and copywriting.
- Style direction: the chips (No people, Minimalist white, Fall colours, Bright & airy, Holiday) toggle their phrase in and out of the text field.
- New run starts clean: clear uploaded photos, scene images, selected pin and approvals.

## 5. Scenes must actually change
- Confirm that `/api/scenes/mockup` returns generated backgrounds on Render (check `SCENE_PROVIDER` and `ABACUS_API_KEY` in the Render environment). If it fails, the review grid should show the failure message instead of silently falling back to the raw photo.
- Each pin uses a different chosen scene in rotation (pin 1 → scene A, pin 2 → scene B, pin 3 → scene C), with the product composited onto the selected mockup type.
