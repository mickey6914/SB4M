// Mockup templates — the seller's own, transcribed from the prompts that
// produced the mockups their shop already runs on.
//
// This is a different shape from §7's hybrid scenes and deliberately so. A
// hybrid scene generates an EMPTY backdrop and composites the product photo on
// top, because a photograph of a physical object must not be redrawn. These
// templates hand the artwork TO the model as an input image and ask it to apply
// the art to a product — a t-shirt, a mug, a framed print. See DECISIONS.md §11
// for why that trade is right for digital art and wrong for physical goods.
//
// Each template carries the prompt in the seller's own phrasing where one
// existed, and optionally a model: the pro image model earns its cost where a
// room has to look designed rather than merely plausible. Ratios are NOT the
// seller's originals — those were landscape, and every crop this app renders
// is portrait or square, so see PIN_RATIO below.

export type MockupTemplate = {
  label: string;
  prompt: string;
  aspectRatio: string;
  model?: string;
  // Some shots are defined by their camera position — a flat lay seen from a
  // three-quarter angle is not a flat lay. Those keep the angle fixed and vary
  // only in light and styling.
  overhead?: boolean;
};

// "the attached digital art piece" / "the input image" is how the seller's
// prompts refer to the artwork, and the models respond to it, so it stays.
const PLACE_IT =
  'Ensure the input image is placed directly and clearly onto the target surface with realistic perspective and lighting.';

// Added to every template after the first real run produced pins where the
// product was a small element in a wide scene, and then lost its edges
// entirely once cropped. Two separate demands:
//
//   Close and dominant — a pin is seen at thumbnail size in a feed, so a mug
//   across a kitchen reads as a kitchen, not as a mug.
//
//   Margin on every side — every crop this app renders is portrait or square
//   (2:3, 4:5, 1:1, 9:16), so whatever the model frames tight to an edge is
//   the first thing a re-crop removes.
const SUBJECT_RULE =
  'The product fills most of the frame, photographed close up and centred, with the artwork on it fully visible and unobstructed. Leave clear margin on all four sides so the image can be re-cropped to square and to taller formats without cutting into the product.';

// Every crop is portrait or square, so a landscape source is the worst
// possible shape: each re-crop discards most of its width. 2:3 is Pinterest's
// native pin and the tallest common ratio, so it crops down to the others by
// trimming rather than gutting.
const PIN_RATIO = '2:3';

// — Making seven pins look like seven pins —
//
// Generating each pin separately was not enough. The prompts are specific
// enough that the model had almost no room left to differ, so seven distinct
// generations came back as seven near-identical pictures. Fresh randomness
// does not help when the instructions pin down the shot.
//
// So the shot itself varies. Three independent axes, indexed by the pin's
// variant number: 6 x 5 x 6 = 180 combinations before one repeats, which is
// more than a month's schedule. Nothing here touches the product or the
// artwork — only where the camera is, what the light is doing, and what else
// is in the room.
const ANGLES = [
  'Photographed straight on at eye level.',
  'Photographed from slightly above, looking down at the product.',
  'Photographed from a low three-quarter angle.',
  'Photographed from a three-quarter angle to the right.',
  'Photographed close overhead, looking almost straight down.',
  'Photographed from a three-quarter angle to the left, slightly below.',
];

const LIGHTING = [
  'Soft morning window light falling from the left.',
  'Bright, even overcast daylight.',
  'Warm golden late-afternoon light with long soft shadows.',
  'Diffused studio light, minimal shadow.',
  'Low warm lamplight with deep shadows in the background.',
];

// Only overhead templates use this. Dropping the camera axis leaves them two
// axes and thirty combinations, which collided inside a single seven-pin run —
// so a flat lay varies its surface instead of its angle.
const SURFACES = [
  'Laid on a pale oak surface.',
  'Laid on warm natural linen.',
  'Laid on a soft off-white backdrop.',
  'Laid on a pale grey concrete surface.',
  'Laid on a muted sage cloth.',
  'Laid on aged light wood with a visible grain.',
  'Laid on a soft cream wool blanket.',
];

const STYLING = [
  'The surroundings are minimal and uncluttered.',
  'A few seasonal props sit just inside the edges of the frame.',
  'Soft greenery is blurred well behind the product.',
  'A plain neutral backdrop with nothing else in shot.',
  'Warm textiles — a folded throw, a linen edge — soften the background.',
  'A window and a hint of the room beyond sit far out of focus behind.',
];

// Picking the shot.
//
// Two constraints fight here. Plain `i % length` fails because pins on one
// template are not consecutive — with three templates they are variants 1, 4,
// 7, a stride of 3, and a stride of 3 against a six-item list visits two
// entries and no more. Hashing fixes that but reintroduces collisions: three
// independent hashes landing on the same index is a one-in-210 event, which
// across the 21 pairs in a seven-pin run happens about a tenth of the time.
// One duplicate pair in seven is the exact complaint this is meant to answer.
//
// So: enumerate the combinations instead. Treat the axes as digits of one
// number and walk it with a stride co-prime to the total, which visits every
// combination once before repeating any. No hash, no collisions, and the same
// pin always asks for the same shot so the cache still means something.
function combinationIndex(i: number, total: number, stride: number): number {
  return (i * stride) % total;
}

export function variationFor(variant: number, overhead = false): string {
  const i = Math.max(0, Math.floor(variant) - 1);

  // An overhead template already fixes the camera — a flat lay seen from a
  // three-quarter angle is not a flat lay — so the surface underneath varies
  // in the angle's place.
  const first = overhead ? SURFACES : ANGLES;
  const total = first.length * LIGHTING.length * STYLING.length;
  // 7 and 11 are co-prime with both totals (180 and 210).
  const combo = combinationIndex(i, total, overhead ? 11 : 7);

  return [
    first[combo % first.length],
    LIGHTING[Math.floor(combo / first.length) % LIGHTING.length],
    STYLING[Math.floor(combo / (first.length * LIGHTING.length)) % STYLING.length],
  ].join(' ');
}

export const MOCKUP_TEMPLATES: MockupTemplate[] = [
  {
    label: 'T-shirt',
    prompt: `A young woman wearing a t-shirt printed with this design, having fun on a fall day in the park with her friends. ${PLACE_IT}` + ' ' + SUBJECT_RULE,
    aspectRatio: PIN_RATIO,
  },
  {
    label: 'Sweatshirt',
    // "Baggy version of this shirt" let the model choose the garment, and it
    // kept choosing a short-sleeve tee or a t-shirt dress. Name the garment.
    prompt:
      'A young woman wearing an oversized long-sleeve crewneck sweatshirt printed with the attached design, having fun on a fall day in the park with her friends. The garment is unmistakably a heavyweight fleece crewneck sweatshirt with ribbed cuffs and a ribbed neckband, long sleeves, not a t-shirt. ' +
      PLACE_IT +
      ' ' +
      SUBJECT_RULE,
    aspectRatio: PIN_RATIO,
  },
  {
    label: 'T-shirt flat lay',
    overhead: true,
    // Flat lays are the seller's staple listing image: the garment laid out
    // and shot straight down, so the artwork reads without a body under it.
    prompt:
      'An overhead flat-lay product photograph of a plain white cotton t-shirt laid flat and smooth on a soft neutral surface, printed with the attached design across the chest. Shot straight down. ' +
      PLACE_IT +
      ' ' +
      SUBJECT_RULE,
    aspectRatio: PIN_RATIO,
  },
  {
    label: 'Sweatshirt flat lay',
    overhead: true,
    prompt:
      'An overhead flat-lay product photograph of a cream long-sleeve crewneck sweatshirt laid flat with the sleeves folded inward, on a soft neutral surface, printed with the attached design across the chest. Heavyweight fleece with ribbed cuffs and a ribbed neckband. Shot straight down. ' +
      PLACE_IT +
      ' ' +
      SUBJECT_RULE,
    aspectRatio: PIN_RATIO,
  },
  {
    label: 'Coffee cup',
    // Rewritten from the seller's original, which framed a whole kitchen and
    // left the mug small enough to miss. The warmth of that scene is kept as
    // background; the mug is now the subject.
    prompt:
      // The seller's original put a tabby cat and a cocker spaniel in the
      // background. Baked into the template they appeared in every single mug
      // pin, which wears out fast. The room is left to the styling axis now.
      'A close-up lifestyle mockup of a ceramic mug printed with the attached digital art piece, held in both hands at a kitchen table, turned so the artwork faces the camera squarely. ' +
      PLACE_IT +
      ' ' +
      SUBJECT_RULE,
    aspectRatio: PIN_RATIO,
    model: 'nano_banana_pro',
  },
  {
    label: 'Pillow',
    prompt: `A throw pillow printed with the attached digital art piece, resting on a linen sofa in a warm, sunlit living room with a knitted blanket beside it. ${PLACE_IT}` + ' ' + SUBJECT_RULE,
    aspectRatio: PIN_RATIO,
  },
  {
    label: 'Invitation card',
    prompt: `A greeting card printed with the attached digital art piece, standing on a wooden table beside a kraft envelope and a sprig of dried flowers, in soft natural light. ${PLACE_IT}` + ' ' + SUBJECT_RULE,
    aspectRatio: PIN_RATIO,
  },
  {
    label: 'Wall art',
    prompt:
      'A poster of the attached digital art piece hanging in a wooden frame on a beige gallery wall with professional lighting. ' +
      PLACE_IT +
      ' ' +
      SUBJECT_RULE,
    aspectRatio: PIN_RATIO,
  },
  {
    label: 'TV wall art',
    prompt:
      'Create a lifestyle mockup showing the attached digital art piece displayed on a modern smart TV in a chic, minimalist living room.' + ' ' + SUBJECT_RULE,
    aspectRatio: PIN_RATIO,
    model: 'nano_banana_pro',
  },
  {
    label: 'Tote bag',
    prompt: `A person carrying a minimalist canvas tote bag. The attached digital art piece is printed clearly and cleanly on the front of the bag, at an outdoor farmers market in autumn light. ${PLACE_IT}` + ' ' + SUBJECT_RULE,
    aspectRatio: PIN_RATIO,
  },
  {
    label: 'Sticker sheet',
    overhead: true,
    prompt:
      'A flat sticker sheet mockup. A single sheet of paper on a dark charcoal background displays the motifs from the attached image as die-cut stickers. Each sticker has a clean white border and a subtle drop shadow. The composition is clean and professional, showing the stickers arranged neatly on the sheet. Overhead perspective.' + ' ' + SUBJECT_RULE,
    aspectRatio: PIN_RATIO,
  },
  {
    label: 'Planner stickers',
    overhead: true,
    prompt:
      'A sticker mockup showing die-cut style stickers of the motifs from the attached image placed inside an open planner. The stickers have a high-quality die-cut white border and subtle shadow, looking as if they are freshly peeled and stuck to the page. Overhead composition.' + ' ' + SUBJECT_RULE,
    aspectRatio: PIN_RATIO,
  },
];

export function templateByLabel(label: string): MockupTemplate | undefined {
  const wanted = label.trim().toLowerCase();
  return MOCKUP_TEMPLATES.find((t) => t.label.toLowerCase() === wanted);
}

export const TEMPLATE_LABELS = MOCKUP_TEMPLATES.map((t) => t.label);
