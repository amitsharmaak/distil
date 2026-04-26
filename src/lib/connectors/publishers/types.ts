import "server-only";

import type { Page } from "playwright";

export interface PublisherDefinition {
  id: string;
  name: string;
  homeUrl: string;
  loginUrl: string;

  sessionProbe: {
    url: string;
    expectSelector?: string;
    expectNotSelector?: string;
  };

  urlMatcher: (url: string) => boolean;

  extract?: (page: Page) => Promise<{
    title: string;
    html: string;
    author?: string;
  }>;

  discovery: PublisherDiscoveryStrategy[];

  fetchConcurrency?: number;
  minDelayMs?: number;
}

export type PublisherDiscoveryStrategy =
  | { kind: "gmail-sender"; senders: string[] }
  | { kind: "rss"; url: string }
  | { kind: "logged-in-feed"; path: string; linkSelector: string };

export class PublisherAuthRequired extends Error {
  readonly publisherId: string;

  constructor(publisherId: string, message?: string) {
    super(message ?? `Publisher "${publisherId}" requires re-authentication`);
    this.name = "PublisherAuthRequired";
    this.publisherId = publisherId;
  }
}
