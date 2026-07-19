/**
 * First-pass heuristic, tuned by feel rather than data — these caps/weights
 * are meant to be adjusted once real shows have been scored and checked
 * against actual resale outcomes.
 */
const MAX_RELEVANT_CAPACITY = 20_000; // arena-scale; beyond this, extra seats barely move the scarcity math
const MAX_PRESALE_PHASES = 4; // 4+ presale waves (fan club, Verified Fan, card-member, ...) treated as max demand
const MAX_TOUR_SCALE = 50; // 50+ upcoming shows treated as "big act" ceiling
const PRESALE_WEIGHT = 0.6;
const TOUR_SCALE_WEIGHT = 0.4;
const URGENCY_HORIZON_DAYS = 30; // 30+ days until the next window opens ramps down to the lowest urgency
const RECENT_OPEN_WINDOW_DAYS = 3; // a window that opened this recently still counts as fresh/urgent
const MAX_RELEVANT_FACE_VALUE = 150; // face value at/above this treated as already fully priced, no headroom
const MAX_RELEVANT_SPREAD_RATIO = 3; // (max-min)/min at/above this (heavy VIP/platinum tiering) treated as no headroom
const FACE_VALUE_WEIGHT = 0.5;
const SPREAD_WEIGHT = 0.5;
const CAPACITY_POPULARITY_COMPOSITE_WEIGHT = 0.6; // scarcity (room size vs demand) leans harder on resale strength than price shape alone
const PRICE_TIER_COMPOSITE_WEIGHT = 0.4;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export interface PopularityInput {
  presalePhaseCount: number | null;
  upcomingEventsTotal: number | null;
}

export interface PopularityBreakdown {
  score: number; // 0-100
  presaleIntensity: number; // 0-1, this show's demand-management intensity
  tourScale: number; // 0-1, the artist's overall tour scale
}

/** Popularity proxy built only from Ticketmaster data: presale complexity (per-show demand) + tour scale (overall draw). */
export function computePopularitySignal(input: PopularityInput): PopularityBreakdown {
  const presaleIntensity = clamp01((input.presalePhaseCount ?? 0) / MAX_PRESALE_PHASES);
  const tourScale = clamp01((input.upcomingEventsTotal ?? 0) / MAX_TOUR_SCALE);
  const score = Math.round(100 * (PRESALE_WEIGHT * presaleIntensity + TOUR_SCALE_WEIGHT * tourScale));
  return { score, presaleIntensity, tourScale };
}

export interface CapacityVsPopularityInput extends PopularityInput {
  capacity: number | null;
}

export interface CapacityVsPopularityResult {
  /** 0-100, or null when the venue's capacity hasn't been entered yet (see `npm run venues -- missing`). */
  signal: number | null;
  reason?: string;
  popularity: PopularityBreakdown;
  capacity: number | null;
  /** 0-1, higher for smaller venues — how much a given popularity level gets concentrated into scarce seats. */
  capacityFactor: number | null;
}

/**
 * Combines popularity (demand) with venue capacity (supply) into a single
 * scarcity-flavored signal: high popularity in a small room scores high,
 * the same popularity in a stadium scores low, and low popularity scores
 * low regardless of room size.
 */
export function computeCapacityVsPopularitySignal(input: CapacityVsPopularityInput): CapacityVsPopularityResult {
  const popularity = computePopularitySignal(input);

  if (input.capacity == null) {
    return {
      signal: null,
      reason: "venue capacity unknown — run `npm run venues -- missing` to fill it in",
      popularity,
      capacity: null,
      capacityFactor: null,
    };
  }

  const capacityFactor = clamp01(1 - input.capacity / MAX_RELEVANT_CAPACITY);
  const signal = Math.round(100 * (popularity.score / 100) * capacityFactor);

  return { signal, popularity, capacity: input.capacity, capacityFactor };
}

export type OnsaleStatus = "on-sale-now" | "on-sale-open" | "upcoming" | "sale-ended" | "unknown";

export interface UrgencyInput {
  presaleStart: string | null;
  presaleEnd: string | null;
  onsaleStart: string | null;
  onsaleEnd: string | null;
  /** Overridable for testing; defaults to the real current time. */
  now?: Date;
}

export interface UrgencyResult {
  status: OnsaleStatus;
  /** 0-100: how soon you need to act. Null when there's nothing to act on (no data, or the sale's already over). */
  urgency: number | null;
  /** Days until the next window opens; 0 (or negative) when a window is currently open. Null if not applicable. */
  daysUntilNextWindow: number | null;
}

function parseDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Urgency is not about resale potential — it's about how soon you need to
 * pay attention. A show that's ranking as hot but doesn't go on sale for
 * three months can wait; one that's live right now (or opens in the next
 * day or two) needs to jump to the top of what you look at today.
 *
 * Ticketmaster's onsale window commonly stays "open" for months (start date
 * through just before the show), so "is a window currently open" by itself
 * isn't a useful urgency signal — nearly everything would read as maximally
 * urgent. Only a window that opened *recently* counts as fresh/urgent; one
 * that's simply been open for a while is "on-sale-open" (available, but
 * nothing time-sensitive about it).
 */
export function computeOnsaleUrgency(input: UrgencyInput): UrgencyResult {
  const now = input.now ?? new Date();
  const windows = [
    { start: parseDate(input.presaleStart), end: parseDate(input.presaleEnd) },
    { start: parseDate(input.onsaleStart), end: parseDate(input.onsaleEnd) },
  ].filter((w): w is { start: Date; end: Date | null } => w.start !== null);

  if (windows.length === 0) {
    return { status: "unknown", urgency: null, daysUntilNextWindow: null };
  }

  const liveWindows = windows.filter((w) => w.start <= now && (w.end === null || w.end >= now));
  if (liveWindows.length > 0) {
    const mostRecentStart = liveWindows.reduce((latest, w) => (w.start > latest ? w.start : latest), liveWindows[0].start);
    const daysSinceStart = (now.getTime() - mostRecentStart.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceStart <= RECENT_OPEN_WINDOW_DAYS) {
      return { status: "on-sale-now", urgency: 100, daysUntilNextWindow: 0 };
    }
    return { status: "on-sale-open", urgency: 0, daysUntilNextWindow: null };
  }

  const futureStarts = windows
    .map((w) => w.start)
    .filter((start) => start > now)
    .sort((a, b) => a.getTime() - b.getTime());

  if (futureStarts.length > 0) {
    const daysUntil = (futureStarts[0].getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    const urgency = Math.round(100 * clamp01(1 - daysUntil / URGENCY_HORIZON_DAYS));
    return { status: "upcoming", urgency, daysUntilNextWindow: Math.round(daysUntil * 10) / 10 };
  }

  // Every known window is entirely in the past — primary sale has ended, only resale is left.
  return { status: "sale-ended", urgency: 0, daysUntilNextWindow: null };
}

export interface PriceTierInput {
  priceMin: number | null;
  priceMax: number | null;
}

export interface PriceTierResult {
  /** 0-100, or null when Ticketmaster didn't return a price. Higher = more apparent headroom for resale markup. */
  signal: number | null;
  reason?: string;
  /** 0-1, higher when face value is cheap — more room to mark up before hitting what buyers already expect to pay. */
  faceValueHeadroom: number | null;
  /** 0-1, higher when min/max are close together — the promoter hasn't already skimmed demand via VIP/platinum tiers. */
  spreadHeadroom: number | null;
  spreadRatio: number | null;
}

/**
 * Two angles on the same question — how much resale headroom does the face
 * value leave on the table: is the ticket cheap outright, and has the
 * promoter already captured a chunk of the surplus themselves via a wide
 * spread of price tiers (GA vs VIP vs platinum)? A cheap ticket with a huge
 * platinum upcharge already sitting on top of it has less room left for
 * resale than the same face value with a flat, single price tier.
 */
export function computePriceTierSignal(input: PriceTierInput): PriceTierResult {
  if (input.priceMin == null || input.priceMin <= 0) {
    return {
      signal: null,
      reason: "no face value price available from Ticketmaster for this event",
      faceValueHeadroom: null,
      spreadHeadroom: null,
      spreadRatio: null,
    };
  }

  const faceValueHeadroom = clamp01(1 - input.priceMin / MAX_RELEVANT_FACE_VALUE);

  const priceMax = input.priceMax ?? input.priceMin;
  const spreadRatio = (priceMax - input.priceMin) / input.priceMin;
  const spreadHeadroom = clamp01(1 - spreadRatio / MAX_RELEVANT_SPREAD_RATIO);

  const signal = Math.round(100 * (FACE_VALUE_WEIGHT * faceValueHeadroom + SPREAD_WEIGHT * spreadHeadroom));

  return { signal, faceValueHeadroom, spreadHeadroom, spreadRatio };
}

export type TransferabilityStatus = "likely-transferable" | "restricted";

export interface TransferabilityResult {
  status: TransferabilityStatus;
  /** The restriction keyword that triggered a "restricted" flag, for manual verification. */
  matchedPhrase: string | null;
  /** Raw Ticketmaster info/pleaseNote text, if any, so you can read the actual wording yourself. */
  notes: string | null;
}

/**
 * Ticketmaster's Discovery API has no structured "transferable: true/false"
 * field — restriction language (non-transferable, ID checks, mobile-entry
 * only, Verified Fan, etc.) only shows up as free text in a promoter's
 * info/pleaseNote fields, when they bother to write it at all. This is a
 * best-effort keyword scan over that text, not a reliable structured check:
 * it will miss restrictions the promoter didn't spell out here, and
 * defaults to "likely-transferable" (the norm) when nothing matches. Treat
 * a "restricted" flag as a strong lead to verify manually, and don't treat
 * "likely-transferable" as a guarantee.
 */
const RESTRICTION_KEYWORDS = [
  "non-transferable",
  "not transferable",
  "no transfers",
  "cannot be transferred",
  "no resale",
  "resale is prohibited",
  "resale prohibited",
  "id required",
  "photo id match",
  "name on ticket must match",
  "verified fan",
  "will call only",
  "mobile entry only",
];

export function computeTransferability(restrictionNotes: string | null): TransferabilityResult {
  if (!restrictionNotes) {
    return { status: "likely-transferable", matchedPhrase: null, notes: null };
  }

  const lower = restrictionNotes.toLowerCase();
  const matched = RESTRICTION_KEYWORDS.find((kw) => lower.includes(kw));

  if (matched) {
    return { status: "restricted", matchedPhrase: matched, notes: restrictionNotes };
  }

  return { status: "likely-transferable", matchedPhrase: null, notes: restrictionNotes };
}

export type CompositeBasis = "capacity-vs-popularity" | "price-tier";

export interface CompositeScoreInput {
  capacityVsPopularity: CapacityVsPopularityResult;
  priceTier: PriceTierResult;
  transferability: TransferabilityResult;
}

export interface CompositeScoreResult {
  /** 0-100, or null when neither underlying signal has enough data yet. */
  score: number | null;
  /** Which sub-signals actually fed the score — a partial-data score (one basis) is less confident than a full one (both). */
  basis: CompositeBasis[];
  restricted: boolean;
  reason?: string;
}

/**
 * Final resale-quality ranking score. Deliberately excludes onsale urgency —
 * urgency is about *when* to act, not *whether* a show is a good resale
 * prospect, so it stays a separate decorator (see computeOnsaleUrgency)
 * rather than blurring into this ranking.
 *
 * A transferability-restricted show scores 0 outright (tickets that can't
 * be resold aren't a resale prospect, no matter how scarce or cheap) but
 * still gets a score rather than being dropped from the list, so it stays
 * visible for its own sake (e.g. you still want to go).
 *
 * When one input is missing data (most commonly: venue capacity not on
 * file yet), the score degrades gracefully to whichever signal is
 * available rather than going null — `basis` says how many signals backed
 * it, so a single-signal score can be told apart from a corroborated one.
 */
export function computeCompositeScore(input: CompositeScoreInput): CompositeScoreResult {
  if (input.transferability.status === "restricted") {
    return {
      score: 0,
      basis: [],
      restricted: true,
      reason: `transferability restricted (matched "${input.transferability.matchedPhrase}") — verify manually`,
    };
  }

  const parts: Array<{ value: number; weight: number; basis: CompositeBasis }> = [];
  if (input.capacityVsPopularity.signal !== null) {
    parts.push({
      value: input.capacityVsPopularity.signal,
      weight: CAPACITY_POPULARITY_COMPOSITE_WEIGHT,
      basis: "capacity-vs-popularity",
    });
  }
  if (input.priceTier.signal !== null) {
    parts.push({ value: input.priceTier.signal, weight: PRICE_TIER_COMPOSITE_WEIGHT, basis: "price-tier" });
  }

  if (parts.length === 0) {
    return {
      score: null,
      basis: [],
      restricted: false,
      reason: "no underlying signal has enough data yet (capacity and price both unknown)",
    };
  }

  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  const score = Math.round(parts.reduce((sum, p) => sum + p.value * p.weight, 0) / totalWeight);

  return { score, basis: parts.map((p) => p.basis), restricted: false };
}
