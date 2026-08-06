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
// Each template carries the prompt verbatim in the seller's own phrasing where
// one existed, the aspect ratio their originals used, and optionally a model:
// the pro image model earns its cost on interiors, where the room has to look
// designed rather than merely plausible.

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

export const MOCKUP_TEMPLATES: MockupTemplate[] = [
  {
    label: 'T-shirt',
    prompt: `A young woman wearing a t-shirt printed with this design, having fun on a fall day in the park with her friends. ${PLACE_IT}`,
    aspectRatio: '4:3',
  },
  {
    label: 'Sweatshirt',
    prompt: `A young woman wearing a baggy version of this shirt having fun on a fall day in the park with her friends. ${PLACE_IT}`,
    aspectRatio: '4:3',
  },
  {
    label: 'Coffee cup',
    prompt:
      'Create a lifestyle mockup of a 50 year old mom sitting at the kitchen table holding the mug printed with the attached digital art piece, in soft morning light, while her tabby cat and cocker spaniel dog sit beside her lovingly watching. ' +
      PLACE_IT,
    aspectRatio: '3:4',
    model: 'nano_banana_pro',
  },
  {
    label: 'Pillow',
    prompt: `A throw pillow printed with the attached digital art piece, resting on a linen sofa in a warm, sunlit living room with a knitted blanket beside it. ${PLACE_IT}`,
    aspectRatio: '4:3',
  },
  {
    label: 'Invitation card',
    prompt: `A greeting card printed with the attached digital art piece, standing on a wooden table beside a kraft envelope and a sprig of dried flowers, in soft natural light. ${PLACE_IT}`,
    aspectRatio: '4:3',
  },
  {
    label: 'Wall art',
    prompt:
      'A poster of the attached digital art piece hanging in a wooden frame on a beige gallery wall with professional lighting. ' +
      PLACE_IT,
    aspectRatio: '4:3',
  },
  {
    label: 'TV wall art',
    prompt:
      'Create a lifestyle mockup showing the attached digital art piece displayed on a modern smart TV in a chic, minimalist living room.',
    aspectRatio: '16:9',
    model: 'nano_banana_pro',
  },
  {
    label: 'Tote bag',
    prompt: `A person carrying a minimalist canvas tote bag. The attached digital art piece is printed clearly and cleanly on the front of the bag, at an outdoor farmers market in autumn light. ${PLACE_IT}`,
    aspectRatio: '4:3',
  },
  {
    label: 'Sticker sheet',
    prompt:
      'A flat sticker sheet mockup. A single sheet of paper on a dark charcoal background displays the motifs from the attached image as die-cut stickers. Each sticker has a clean white border and a subtle drop shadow. The composition is clean and professional, showing the stickers arranged neatly on the sheet. Realistic lighting and overhead perspective.',
    aspectRatio: '4:3',
  },
  {
    label: 'Planner stickers',
    prompt:
      'A sticker mockup showing die-cut style stickers of the motifs from the attached image placed inside an open planner. The stickers have a high-quality die-cut white border and subtle shadow, looking as if they are freshly peeled and stuck to the page. Realistic lighting and overhead composition.',
    aspectRatio: '4:3',
  },
];

export function templateByLabel(label: string): MockupTemplate | undefined {
  const wanted = label.trim().toLowerCase();
  return MOCKUP_TEMPLATES.find((t) => t.label.toLowerCase() === wanted);
}

export const TEMPLATE_LABELS = MOCKUP_TEMPLATES.map((t) => t.label);
