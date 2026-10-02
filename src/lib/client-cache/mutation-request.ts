"use client";

import { announceAccountChange } from "./auth-events";

/** Content writes keep their fresh server checks and retire local data on auth denial. */
export async function contentMutationRequest(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const response = await fetch(url, init);
  if (response.status === 401 || response.status === 403) announceAccountChange();
  return response;
}
