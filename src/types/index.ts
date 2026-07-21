export interface WatchlistEntry {
  id: number;
  artistName: string;
  ticketmasterAttractionId: string | null;
  upcomingEventsTotal: number | null;
  notes: string | null;
  createdAt: string;
}

export interface EventRecord {
  id: string; // Ticketmaster event id, used as primary key
  name: string;
  artistName: string;
  venueName: string;
  venueCity: string;
  venueCapacity: number | null;
  eventDate: string; // ISO date
  onsaleStart: string | null;
  onsaleEnd: string | null;
  presaleStart: string | null;
  presaleEnd: string | null;
  priceMin: number | null;
  priceMax: number | null;
  currency: string | null;
  presalePhaseCount: number | null;
  restrictionNotes: string | null;
  ticketmasterUrl: string;
  discoveredVia: "watchlist" | "auto-discovery";
  fetchedAt: string;
}

export interface VenueRecord {
  id: number;
  venueName: string;
  venueCity: string;
  capacity: number | null;
  capacitySource: "manual" | "wikidata" | null;
  wikidataCheckedAt: string | null;
  notes: string | null;
  updatedAt: string;
}

export interface PriceComp {
  id: number;
  eventId: string;
  source: "seatgeek";
  medianResalePrice: number | null;
  lowestResalePrice: number | null;
  faceValueEstimate: number | null;
  fetchedAt: string;
}

export interface ScoreRecord {
  eventId: string;
  score: number; // 0-100
  resaleRatioSignal: number | null;
  capacitySignal: number | null;
  urgencySignal: number | null;
  computedAt: string;
}

export interface PresaleCode {
  eventId: string;
  code: string | null;
  source: string | null;
  savedAt: string | null;
}
