"use client";

import { createAuthClient } from "@neondatabase/auth/next";

/** Same-origin client. The Next adapter proxies through /api/auth. */
export const neonAuthClient = createAuthClient();
