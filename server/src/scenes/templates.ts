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
    // Flat lays are the seller's staple listing image: the garment laid out
    // and shot straight down, so the artwork reads without a body under it.
    prompt:
      'An overhead flat-lay product photograph of a plain white cotton t-shirt laid flat and smooth on a soft neutral surface, printed with the attached design across the chest. Shot straight down, evenly lit, with a few simple seasonal props arranged at the corners of the frame. ' +
      PLACE_IT +
      ' ' +
      SUBJECT_RULE,
    aspectRatio: PIN_RATIO,
  },
  {
    label: 'Sweatshirt flat lay',
    prompt:
      'An overhead flat-lay product photograph of a cream long-sleeve crewneck sweatshirt laid flat with the sleeves folded inward, on a soft neutral surface, printed with the attached design across the chest. Heavyweight fleece with ribbed cuffs and a ribbed neckband. Shot straight down, evenly lit, minimal props. ' +
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
      'A close-up lifestyle mockup of a ceramic mug printed with the attached digital art piece, held in both hands at a kitchen table in soft morning light, turned so the artwork faces the camera squarely. A tabby cat and a cocker spaniel are softly blurred in the background. ' +
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
    prompt:
      'A flat sticker sheet mockup. A single sheet of paper on a dark charcoal background displays the motifs from the attached image as die-cut stickers. Each sticker has a clean white border and a subtle drop shadow. The composition is clean and professional, showing the stickers arranged neatly on the sheet. Realistic lighting and overhead perspective.' + ' ' + SUBJECT_RULE,
    aspectRatio: PIN_RATIO,
  },
  {
    label: 'Planner stickers',
    prompt:
      'A sticker mockup showing die-cut style stickers of the motifs from the attached image placed inside an open planner. The stickers have a high-quality die-cut white border and subtle shadow, looking as if they are freshly peeled and stuck to the page. Realistic lighting and overhead composition.' + ' ' + SUBJECT_RULE,
    aspectRatio: PIN_RATIO,
  },
];

export function templateByLabel(label: string): MockupTemplate | undefined {
  const wanted = label.trim().toLowerCase();
  return MOCKUP_TEMPLATES.find((t) => t.label.toLowerCase() === wanted);
}

export const TEMPLATE_LABELS = MOCKUP_TEMPLATES.map((t) => t.label);
