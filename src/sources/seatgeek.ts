import { env } from "../config/env.js";

const BASE_URL = "https://api.seatgeek.com/2";

export class SeatGeekError extends Error {}

interface SGSearchParams {
  q?: string;
  performerSlug?: string;
  venueCity?: string;
  startDateTime?: string; // ISO 8601, e.g. 2026-07-18T00:00:00
  endDateTime?: string;
  perPage?: number;
  page?: number;
  sort?: string;
}

interface SGPerformer {
  id: number;
  name: string;
  slug: string;
  primary?: boolean;
}

interface SGVenue {
  name?: string;
  city?: string;
  state?: string;
}

interface SGStats {
  listing_count?: number;
  average_price?: number;
  lowest_price?: number;
  highest_price?: number;
  median_price?: number;
  visible_listing_count?: number;
}

interface SGEvent {
  id: number;
  title: string;
  type?: string;
  datetime_local?: string;
  url: string;
  venue?: SGVenue;
  performers?: SGPerformer[];
  stats?: SGStats;
}

interface SGEventsResponse {
  events?: SGEvent[];
  meta?: { total: number; page: number; per_page: number };
}

interface SGPerformersResponse {
  performers?: SGPerformer[];
}

async function sgFetch<T>(
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("client_id", env.seatgeekClientId());
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new SeatGeekError(`SeatGeek API error ${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}

/** Search SeatGeek events by free-text query, performer slug, city, and/or date range. */
export async function searchEvents(params: SGSearchParams): Promise<SGEvent[]> {
  const data = await sgFetch<SGEventsResponse>("/events", {
    q: params.q,
    "performers.slug": params.performerSlug,
    "venue.city": params.venueCity,
    "datetime_local.gte": params.startDateTime,
    "datetime_local.lte": params.endDateTime,
    per_page: params.perPage ?? 25,
    page: params.page ?? 1,
    sort: params.sort ?? "datetime_local.asc",
  });
  return data.events ?? [];
}

/** Resolve an artist name to SeatGeek performers, for linking against Ticketmaster attractions. */
export async function searchPerformers(query: string): Promise<SGPerformer[]> {
  const data = await sgFetch<SGPerformersResponse>("/performers", {
    q: query,
    per_page: 10,
  });
  return data.performers ?? [];
}

export interface PerformerMatch {
  id: number;
  name: string;
  slug: string;
  /** False when we fell back to the top search result instead of an exact name match. */
  exact: boolean;
}

/** Same exact-match-first strategy as Ticketmaster's resolveAttraction, for consistent artist resolution. */
export async function resolvePerformer(name: string): Promise<PerformerMatch | null> {
  const candidates = await searchPerformers(name);
  if (candidates.length === 0) return null;

  const exactMatch = candidates.find((p) => p.name.toLowerCase() === name.toLowerCase());
  const chosen = exactMatch ?? candidates[0];
  return { id: chosen.id, name: chosen.name, slug: chosen.slug, exact: Boolean(exactMatch) };
}

export interface PriceSnapshot {
  seatgeekEventId: number;
  title: string;
  eventDate: string | null;
  venueName: string | null;
  venueCity: string | null;
  lowestPrice: number | null;
  medianPrice: number | null;
  averagePrice: number | null;
  highestPrice: number | null;
  listingCount: number | null;
  seatgeekUrl: string;
}

/**
 * Extract current secondary-market listing stats for a raw SeatGeek event.
 * Note: SeatGeek only carries live listings for on-sale events — once a show
 * has happened, its listings (and therefore these stats) disappear. So this
 * is a snapshot of the *current* resale market, not a historical archive;
 * "comparable past shows" comps have to be captured while those shows are
 * still upcoming/on sale, not looked up after the fact.
 */
export function mapEventToPriceSnapshot(raw: SGEvent): PriceSnapshot {
  return {
    seatgeekEventId: raw.id,
    title: raw.title,
    eventDate: raw.datetime_local ?? null,
    venueName: raw.venue?.name ?? null,
    venueCity: raw.venue?.city ?? null,
    lowestPrice: raw.stats?.lowest_price ?? null,
    medianPrice: raw.stats?.median_price ?? null,
    averagePrice: raw.stats?.average_price ?? null,
    highestPrice: raw.stats?.highest_price ?? null,
    listingCount: raw.stats?.listing_count ?? null,
    seatgeekUrl: raw.url,
  };
}
