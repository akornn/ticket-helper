import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  ticketmasterApiKey: () => required("TICKETMASTER_API_KEY"),
  seatgeekClientId: () => required("SEATGEEK_CLIENT_ID"),
  seatgeekClientSecret: process.env.SEATGEEK_CLIENT_SECRET ?? "",

  dbPath: optional("DB_PATH", "./data/ticket-helper.db"),
  port: Number(optional("PORT", "4310")),

  tmDefaultSegment: optional("TM_DEFAULT_SEGMENT", "Music"),
  tmDefaultCountryCode: optional("TM_DEFAULT_COUNTRY_CODE", "US"),
};
