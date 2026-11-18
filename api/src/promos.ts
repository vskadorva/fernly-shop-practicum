import { ApiError } from './errors.js';

export interface Promo {
  code: string;
  kind: 'percent' | 'free-shipping';
  percent?: number;
  /** YYYY-MM-DD, last day the code works. */
  expiresAt: string;
  label: string;
}

export const PROMOS: Promo[] = [
  { code: 'LEAFY10', kind: 'percent', percent: 10, expiresAt: '2026-12-31', label: '10% off your plants' },
  { code: 'FREESHIP', kind: 'free-shipping', expiresAt: '2026-12-31', label: 'Free shipping' },
  { code: 'SPRING5', kind: 'percent', percent: 5, expiresAt: '2026-04-30', label: '5% off your plants' },
];

/** Finds a promo by its code, ignoring upper and lower case. */
export function findPromo(code: string): Promo {
  const promo = PROMOS.find((candidate) => candidate.code === code.trim().toUpperCase());
  if (!promo) throw new ApiError(400, "We don't recognize this code.", 'promo_invalid');
  return promo;
}
