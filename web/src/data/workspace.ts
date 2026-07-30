// Workspace and shop structure per DECISIONS.md #1: Deals and Steals For Real
// is the parent workspace; Express Art Vibe is a shop under it (Etsy). Sized
// for up to 3 shops — every run and post will carry a shopId — but v1 renders
// a single shop and the switcher stays a label until a second shop exists.
// Static client data until the server owns it.

export type Shop = {
  id: string;
  name: string;
  initials: string;
  source: string;
  networks: string;
};

export const WORKSPACE = {
  name: 'Deals and Steals For Real',
  content360Id: '34b00c5d',
};

export const SHOPS: Shop[] = [
  {
    id: 'eav',
    name: 'Express Art Vibe',
    initials: 'EAV',
    source: 'Etsy',
    networks: 'Pinterest · Facebook Page · Instagram',
  },
];

export const activeShop = SHOPS[0];
