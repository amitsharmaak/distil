import "server-only";

import { config } from "../../config";
import { theKen } from "./publishers/the-ken";
import type { PublisherDefinition } from "./types";

const ALL_PUBLISHERS: PublisherDefinition[] = [theKen];

function applyEnabledFilter(
  publishers: PublisherDefinition[],
): PublisherDefinition[] {
  const enabled = config.publishersEnabled;
  if (!enabled || enabled.length === 0) return publishers;
  const allow = new Set(enabled);
  return publishers.filter((p) => allow.has(p.id));
}

export const PUBLISHERS: PublisherDefinition[] = applyEnabledFilter(ALL_PUBLISHERS);

export function getById(id: string): PublisherDefinition | undefined {
  return PUBLISHERS.find((p) => p.id === id);
}

export function findByUrl(url: string): PublisherDefinition | undefined {
  return PUBLISHERS.find((p) => p.urlMatcher(url));
}
