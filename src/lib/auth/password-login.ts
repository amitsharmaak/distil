import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { AccessDeniedError } from "@/lib/auth/account";
import { normalizeEmail } from "@/lib/auth/invitations";
import { resolveNeonAuthRequest, type ProviderIdentityPort } from "@/lib/auth/request-context";
import type { AuthRepositoryPort } from "@/lib/auth/ports";
import { AuthError } from "@/lib/auth/errors";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 1024;

const emailSchema = z.string().trim().email().max(320);
const newPasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);
const signInPasswordSchema = z.string().min(1).max(PASSWORD_MAX_LENGTH);
const currentPasswordSchema = z.string().min(1).max(PASSWORD_MAX_LENGTH);
const resetTokenSchema = z.string().min(1).max(4096);

const signInBodySchema = z.object({ email: emailSchema, password: signInPasswordSchema });
const resetRequestBodySchema = z.object({ email: emailSchema });
const resetBodySchema = z.object({ token: resetTokenSchema, newPassword: newPasswordSchema });
const changeBodySchema = z.object({
  currentPassword: currentPasswordSchema,
  newPassword: newPasswordSchema,
});

export interface PasswordProvider extends ProviderIdentityPort {
  signInWithPassword(input: {
    email: string;
    password: string;
  }): Promise<{ ok: boolean; setCookieHeaders: string[] }>;
  requestPasswordReset(input: { email: string; redirectTo: string }): Promise<{ ok: boolean }>;
  resetPassword(input: { token: string; newPassword: string }): Promise<{ ok: boolean }>;
  changePassword(input: {
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions: boolean;
    cookieHeader?: string;
  }): Promise<{ ok: boolean; setCookieHeaders: string[] }>;
}

function unauthorizedInvalidCredentials(): Response {
  return Response.json(
    { error: { code: "UNAUTHORIZED", message: "Invalid email or password" } },
    { status: 401 }
  );
}

function mapAuthErrors(error: unknown): Response {
  if (error instanceof AuthError) {
    return Response.json(
      { error: { code: error.code, message: "Unable to continue" } },
      { status: error.status }
    );
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return Response.json(
      { error: { code: "INVALID_REQUEST", message: "Unable to continue" } },
      { status: 400 }
    );
  }
  return Response.json(
    { error: { code: "AUTH_UNAVAILABLE", message: "Unable to continue" } },
    { status: 503 }
  );
}

/**
 * Adapts the hosted Neon Auth provider's password endpoints. Never logs or
 * surfaces provider response bodies; only the boolean success outcome and any
 * Set-Cookie headers cross this boundary.
 */
export function neonPasswordProvider(
  auth: {
    getSession: ProviderIdentityPort["getSession"];
    handler(): {
      POST(request: Request, context: { params: Promise<{ path: string[] }> }): Promise<Response>;
    };
  },
  appOrigin: string
): PasswordProvider {
  const dispatch = async (path: string[], body: unknown, cookieHeader?: string) => {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      origin: appOrigin,
    };
    if (cookieHeader) headers.cookie = cookieHeader;
    const response = await auth.handler().POST(
      new Request(new URL(`/api/auth/${path.join("/")}`, appOrigin), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ path }) }
    );
    return response;
  };

  return {
    getSession: (input) => auth.getSession(input),
    signInWithPassword: async (input) => {
      const response = await dispatch(["sign-in", "email"], input);
      return { ok: response.ok, setCookieHeaders: response.headers.getSetCookie() };
    },
    requestPasswordReset: async (input) => {
      const response = await dispatch(["request-password-reset"], input);
      return { ok: response.ok };
    },
    resetPassword: async (input) => {
      const response = await dispatch(["reset-password"], input);
      return { ok: response.ok };
    },
    changePassword: async (input) => {
      const response = await dispatch(
        ["change-password"],
        {
          currentPassword: input.currentPassword,
          newPassword: input.newPassword,
          revokeOtherSessions: input.revokeOtherSessions,
        },
        input.cookieHeader
      );
      return { ok: response.ok, setCookieHeaders: response.headers.getSetCookie() };
    },
  };
}

/**
 * Signs in with email + password. Unknown, inactive, or emailless accounts
 * receive the same generic invalid-credentials response as a provider
 * rejection, and the provider is never dispatched for them, to avoid
 * disclosing which addresses have accounts.
 */
export function createPasswordSignInHandler(dependencies: {
  provider: PasswordProvider;
  repositories: AuthRepositoryPort;
  appOrigin: string;
  beforeAttempt?: (
    account: NonNullable<Awaited<ReturnType<AuthRepositoryPort["findAccountByEmail"]>>>,
    request: Request
  ) => Promise<void>;
}) {
  return async function POST(request: Request): Promise<Response> {
    try {
      requireAllowedOrigin(request, new Set([dependencies.appOrigin]));
      const body = await request.json();
      const { email, password } = signInBodySchema.parse(body);
      const account = await dependencies.repositories.findAccountByEmail(normalizeEmail(email));
      if (!account || account.status !== "active" || !account.primaryEmail) {
        return unauthorizedInvalidCredentials();
      }
      await dependencies.beforeAttempt?.(account, request);
      const result = await dependencies.provider.signInWithPassword({
        email: account.primaryEmail,
        password,
      });
      if (!result.ok) return unauthorizedInvalidCredentials();
      const response = NextResponse.json({ authenticated: true }, { status: 200 });
      for (const setCookie of result.setCookieHeaders) {
        response.headers.append("set-cookie", setCookie);
      }
      response.headers.set("cache-control", "private, no-store");
      return response;
    } catch (error) {
      return mapAuthErrors(error);
    }
  };
}

/**
 * Requests a password reset email only for an existing active account.
 * Unknown addresses, inactive accounts, rate-limiting, and provider failures
 * all return the same accepted response to avoid enumeration.
 */
export function createPasswordResetRequestHandler(dependencies: {
  provider: PasswordProvider;
  repositories: AuthRepositoryPort;
  appOrigin: string;
  beforeDispatch?: (
    account: NonNullable<Awaited<ReturnType<AuthRepositoryPort["findAccountByEmail"]>>>,
    request: Request
  ) => Promise<void>;
}) {
  return async function POST(request: Request): Promise<Response> {
    try {
      requireAllowedOrigin(request, new Set([dependencies.appOrigin]));
      const body = await request.json();
      const { email } = resetRequestBodySchema.parse(body);
      const account = await dependencies.repositories.findAccountByEmail(normalizeEmail(email));
      const accepted = () => NextResponse.json({ accepted: true }, { status: 202 });
      if (!account || account.status !== "active" || !account.primaryEmail) return accepted();
      try {
        await dependencies.beforeDispatch?.(account, request);
      } catch (error) {
        if (error instanceof AuthError && error.code === "RATE_LIMITED") return accepted();
        throw error;
      }
      const result = await dependencies.provider.requestPasswordReset({
        email: account.primaryEmail,
        redirectTo: new URL("/reset-password", dependencies.appOrigin).toString(),
      });
      if (!result.ok) return accepted();
      return accepted();
    } catch (error) {
      return mapAuthErrors(error);
    }
  };
}

export function createPasswordResetHandler(dependencies: {
  provider: PasswordProvider;
  appOrigin: string;
}) {
  return async function POST(request: Request): Promise<Response> {
    try {
      requireAllowedOrigin(request, new Set([dependencies.appOrigin]));
      const body = await request.json();
      const { token, newPassword } = resetBodySchema.parse(body);
      const result = await dependencies.provider.resetPassword({ token, newPassword });
      if (!result.ok) {
        return Response.json(
          {
            error: {
              code: "INVALID_REQUEST",
              message: "This reset link is invalid or has expired",
            },
          },
          { status: 400 }
        );
      }
      return NextResponse.json({ reset: true }, { status: 200 });
    } catch (error) {
      return mapAuthErrors(error);
    }
  };
}

export function createPasswordChangeHandler(dependencies: {
  provider: PasswordProvider;
  repositories: AuthRepositoryPort;
  appOrigin: string;
}) {
  return async function POST(request: Request): Promise<Response> {
    try {
      requireAllowedOrigin(request, new Set([dependencies.appOrigin]));
      try {
        await resolveNeonAuthRequest(
          dependencies.provider,
          dependencies.repositories,
          request.headers.get("x-trace-id") ?? undefined
        );
      } catch (error) {
        if (error instanceof AccessDeniedError) {
          return Response.json(
            { error: { code: "UNAUTHORIZED", message: "Unable to continue" } },
            { status: 401 }
          );
        }
        throw error;
      }
      const body = await request.json();
      const { currentPassword, newPassword } = changeBodySchema.parse(body);
      const result = await dependencies.provider.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
        cookieHeader: request.headers.get("cookie") ?? undefined,
      });
      if (!result.ok) {
        return Response.json(
          {
            error: {
              code: "INVALID_REQUEST",
              message:
                "Could not change your password. Check your current password, or request a password setup link if you have never set one.",
            },
          },
          { status: 400 }
        );
      }
      const response = NextResponse.json({ changed: true }, { status: 200 });
      for (const setCookie of result.setCookieHeaders) {
        response.headers.append("set-cookie", setCookie);
      }
      response.headers.set("cache-control", "private, no-store");
      return response;
    } catch (error) {
      return mapAuthErrors(error);
    }
  };
}
