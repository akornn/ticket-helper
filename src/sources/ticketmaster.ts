import { env } from "../config/env.js";
import type { EventRecord } from "../types/index.js";

const BASE_URL = "https://app.ticketmaster.com/discovery/v2";

export class TicketmasterError extends Error {}

interface TMSearchParams {
  keyword?: string;
  attractionId?: string;
  classificationName?: string;
  countryCode?: string;
  startDateTime?: string; // ISO 8601, e.g. 2026-07-18T00:00:00Z
  endDateTime?: string;
  size?: number;
  page?: number;
  sort?: string;
}

interface TMApiEvent {
  id: string;
  name: string;
  url: string;
  info?: string;
  pleaseNote?: string;
  dates?: {
    start?: { localDate?: string; localTime?: string; dateTime?: string };
  };
  sales?: {
    public?: { startDateTime?: string; endDateTime?: string };
    presales?: Array<{ startDateTime?: string; endDateTime?: string; name?: string }>;
  };
  priceRanges?: Array<{ type?: string; currency?: string; min?: number; max?: number }>;
  _embedded?: {
    venues?: Array<{ name?: string; city?: { name?: string } }>;
    attractions?: Array<{ name?: string; id?: string }>;
  };
}

interface TMSearchResponse {
  _embedded?: { events?: TMApiEvent[] };
  page?: { size: number; totalElements: number; totalPages: number; number: number };
}

interface TMAttraction {
  id: string;
  name: string;
  upcomingEvents?: { _total?: number };
}

interface TMAttractionResponse {
  _embedded?: { attractions?: TMAttraction[] };
}

async function tmFetch<T>(
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("apikey", env.ticketmasterApiKey());
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new TicketmasterError(`Ticketmaster API error ${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}

/** Search events by keyword, attraction id, or classification (e.g. "Music"). */
export async function searchEvents(params: TMSearchParams): Promise<TMApiEvent[]> {
  const data = await tmFetch<TMSearchResponse>("/events.json", {
    keyword: params.keyword,
    attractionId: params.attractionId,
    classificationName: params.classificationName,
    countryCode: params.countryCode ?? env.tmDefaultCountryCode,
    startDateTime: params.startDateTime,
    endDateTime: params.endDateTime,
    size: params.size ?? 50,
    page: params.page ?? 0,
    sort: params.sort ?? "date,asc",
  });
  return data._embedded?.events ?? [];
}

/** Resolve an artist name to Ticketmaster attraction ids, for watchlist seeding. */
export async function searchAttractions(keyword: string): Promise<TMAttraction[]> {
  const data = await tmFetch<TMAttractionResponse>("/attractions.json", {
    keyword,
    size: 10,
  });
  return data._embedded?.attractions ?? [];
}

export interface AttractionMatch {
  id: string;
  name: string;
  /** False when we fell back to the top search result instead of an exact name match. */
  exact: boolean;
  /** Total upcoming events for this attraction — a tour-scale proxy used in the popularity signal. */
  upcomingEventsTotal: number | null;
}

/**
 * Pick the best attraction match for an artist name: prefers an exact
 * (case-insensitive) name match over the top fuzzy search result, since
 * keyword search alone tends to surface tribute acts and cover bands.
 */
export async function resolveAttraction(name: string): Promise<AttractionMatch | null> {
  const candidates = await searchAttractions(name);
  if (candidates.length === 0) return null;

  const exactMatch = candidates.find((a) => a.name.toLowerCase() === name.toLowerCase());
  const chosen = exactMatch ?? candidates[0];
  return {
    id: chosen.id,
    name: chosen.name,
    exact: Boolean(exactMatch),
    upcomingEventsTotal: chosen.upcomingEvents?._total ?? null,
  };
}

/** Convert a raw Discovery API event into our normalized EventRecord. */
export function mapEventToRecord(
  raw: TMApiEvent,
  discoveredVia: "watchlist" | "auto-discovery",
): EventRecord {
  const venue = raw._embedded?.venues?.[0];
  const attraction = raw._embedded?.attractions?.[0];
  const presale = raw.sales?.presales?.[0];
  const standardPriceRange =
    raw.priceRanges?.find((p) => p.type === "standard") ?? raw.priceRanges?.[0];
  const restrictionNotes = [raw.info, raw.pleaseNote].filter(Boolean).join(" ").trim() || null;

  return {
    id: raw.id,
    name: raw.name,
    artistName: attraction?.name ?? raw.name,
    venueName: venue?.name ?? "Unknown venue",
    venueCity: venue?.city?.name ?? "",
    // Discovery API doesn't expose venue capacity; scoring will need a manual
    // lookup table or a secondary source for this signal.
    venueCapacity: null,
    eventDate: raw.dates?.start?.dateTime ?? raw.dates?.start?.localDate ?? "",
    onsaleStart: raw.sales?.public?.startDateTime ?? null,
    onsaleEnd: raw.sales?.public?.endDateTime ?? null,
    presaleStart: presale?.startDateTime ?? null,
    presaleEnd: presale?.endDateTime ?? null,
    priceMin: standardPriceRange?.min ?? null,
    priceMax: standardPriceRange?.max ?? null,
    currency: standardPriceRange?.currency ?? null,
    presalePhaseCount: raw.sales?.presales?.length ?? 0,
    restrictionNotes,
    ticketmasterUrl: raw.url,
    discoveredVia,
    fetchedAt: new Date().toISOString(),
  };
}
