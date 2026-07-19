import { getEventById } from "../db/events.js";
import { setPresaleCode, getPresaleCode, listPresaleCodes } from "../db/presaleCodes.js";
import { buildPresaleSearchLinks } from "../services/links.js";

function usage(): never {
  console.error(
    [
      "Usage:",
      "  npm run presale -- links <eventId>",
      '  npm run presale -- set <eventId> <code> ["source"]',
      "  npm run presale -- list",
      "",
      "(Find event ids with npm run score.)",
    ].join("\n"),
  );
  process.exit(1);
}

function describeEvent(eventId: string): string {
  const event = getEventById(eventId);
  return event ? `${event.artistName} @ ${event.venueName} (${event.eventDate.slice(0, 10)})` : eventId;
}

function main() {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case "links": {
      const [eventId] = rest;
      if (!eventId) usage();
      const event = getEventById(eventId);
      if (!event) {
        console.error(`No event found with id "${eventId}". Run npm run score to find event ids.`);
        process.exit(1);
      }

      const links = buildPresaleSearchLinks(event.artistName);
      console.log(`${event.artistName} @ ${event.venueName}, ${event.venueCity} — ${event.eventDate.slice(0, 10)}\n`);
      console.log(`Official site search:  ${links.officialSiteSearch}`);
      console.log(`X/Twitter search:      ${links.twitterSearch}`);
      console.log(`Reddit search:         ${links.redditSearch}`);

      const existing = getPresaleCode(eventId);
      if (existing?.code) {
        console.log(`\nSaved code: ${existing.code}${existing.source ? `  (source: ${existing.source})` : ""}`);
      }
      break;
    }

    case "set": {
      const [eventId, code, source] = rest;
      if (!eventId || !code) usage();
      if (!getEventById(eventId)) {
        console.error(`No event found with id "${eventId}". Run npm run score to find event ids.`);
        process.exit(1);
      }

      const saved = setPresaleCode(eventId, code, source ?? null);
      console.log(`Saved code "${saved.code}" for ${describeEvent(eventId)}`);
      break;
    }

    case "list": {
      const codes = listPresaleCodes();
      if (codes.length === 0) {
        console.log("No presale codes saved yet.");
        break;
      }
      for (const c of codes) {
        console.log(`- ${describeEvent(c.eventId)}: ${c.code}${c.source ? `  (source: ${c.source})` : ""}`);
      }
      break;
    }

    default:
      usage();
  }
}

main();
