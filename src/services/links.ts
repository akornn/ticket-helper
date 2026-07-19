export interface PresaleSearchLinks {
  officialSiteSearch: string;
  twitterSearch: string;
  redditSearch: string;
}

/**
 * There's no API for presale codes — promoters hand them out via artist
 * mailing lists, fan-club posts, and word of mouth. These are constructed
 * search links, not resolved lookups: no assumption about the artist's
 * actual domain or subreddit name, since guessing those wrong is worse than
 * a one-click search.
 */
export function buildPresaleSearchLinks(artistName: string): PresaleSearchLinks {
  const query = `${artistName} presale code`;

  return {
    officialSiteSearch: `https://www.google.com/search?q=${encodeURIComponent(`${artistName} official website presale`)}`,
    twitterSearch: `https://x.com/search?q=${encodeURIComponent(query)}&f=live`,
    redditSearch: `https://www.reddit.com/search/?q=${encodeURIComponent(query)}`,
  };
}
