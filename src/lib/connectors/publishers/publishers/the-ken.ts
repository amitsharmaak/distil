import "server-only";

import type { PublisherDefinition } from "../types";

export const theKen: PublisherDefinition = {
  id: "the-ken",
  name: "The Ken",
  homeUrl: "https://the-ken.com",
  loginUrl: "https://the-ken.com/login",
  sessionProbe: {
    url: "https://the-ken.com/account",
    expectSelector: "body.logged-in",
  },
  urlMatcher: (url) => /^https?:\/\/(www\.)?the-ken\.com\/[^/]+\/[^/]+/.test(url),
  discovery: [
    {
      kind: "gmail-sender",
      senders: ["newsletter@the-ken.com", "team@the-ken.com"],
    },
  ],
  fetchConcurrency: 1,
  minDelayMs: 2500,
};
