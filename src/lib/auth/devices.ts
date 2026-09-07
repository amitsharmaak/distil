import type { ProviderSession, ProviderSessionPort } from "@/lib/auth/ports";

export interface AuthDevice {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  ipAddress?: string;
  userAgent?: string;
  current: boolean;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export async function listAuthDevices(
  provider: ProviderSessionPort,
  currentSessionId: string
): Promise<AuthDevice[]> {
  const sessions = await provider.listSessions();
  return sessions.map((session) => ({
    id: session.id,
    createdAt: toDate(session.createdAt).toISOString(),
    updatedAt: toDate(session.updatedAt).toISOString(),
    expiresAt: toDate(session.expiresAt).toISOString(),
    ...(session.ipAddress ? { ipAddress: session.ipAddress } : {}),
    ...(session.userAgent ? { userAgent: session.userAgent } : {}),
    current: session.id === currentSessionId,
  }));
}

export async function revokeAuthDevice(
  provider: ProviderSessionPort,
  sessionId: string,
  currentSessionId: string
): Promise<boolean> {
  if (sessionId === currentSessionId) return false;
  const session = (await provider.listSessions()).find((candidate) => candidate.id === sessionId);
  if (!session) return false;
  return provider.revokeSession(session.token);
}

export async function revokeOtherAuthDevices(provider: ProviderSessionPort): Promise<boolean> {
  return provider.revokeOtherSessions();
}

export function neonSessionProvider(auth: {
  listSessions(): Promise<{ data: ProviderSession[] | null; error: unknown | null }>;
  revokeSession(input: {
    token: string;
  }): Promise<{ data: { status: boolean } | null; error: unknown | null }>;
  revokeSessions(): Promise<{ data: { status: boolean } | null; error: unknown | null }>;
  revokeOtherSessions(): Promise<{ data: { status: boolean } | null; error: unknown | null }>;
}): ProviderSessionPort {
  return {
    async listSessions() {
      const result = await auth.listSessions();
      if (result.error || !result.data) throw new Error("Unable to list sessions");
      return result.data;
    },
    async revokeSession(token) {
      const result = await auth.revokeSession({ token });
      return !result.error && result.data?.status === true;
    },
    async revokeAllSessions() {
      const result = await auth.revokeSessions();
      return !result.error && result.data?.status === true;
    },
    async revokeOtherSessions() {
      const result = await auth.revokeOtherSessions();
      return !result.error && result.data?.status === true;
    },
  };
}
