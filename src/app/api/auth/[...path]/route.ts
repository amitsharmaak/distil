import { getNeonAuthServer, NeonAuthConfigurationError } from "@/lib/auth/neon-server";
import { dispatchGatedNeonAuth, type NeonAuthHandler } from "@/lib/auth/neon-route";
import { readAuthEnvironment } from "@/lib/auth/environment";
import { AuthError } from "@/lib/auth/errors";

const NEON_SESSION_COOKIES = [
  "__Secure-neon-auth.session_token",
  "__Secure-neon-auth.local.session_data",
] as const;

function expireNeonSessionCookies(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const name of NEON_SESSION_COOKIES) {
    headers.append("set-cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function privateNoStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "private, no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function dispatch(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  try {
    const response = await dispatchGatedNeonAuth(request, context, {
      loadAllowedOrigins: () => readAuthEnvironment().allowedOrigins,
      loadHandler(method) {
        const handlers = getNeonAuthServer().handler();
        return handlers[method as keyof typeof handlers] as NeonAuthHandler | undefined;
      },
    });
    const { path } = await context.params;
    return privateNoStore(
      response.ok && path.join("/") === "sign-out" ? expireNeonSessionCookies(response) : response
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return privateNoStore(
        Response.json(
          { error: { code: "ORIGIN_NOT_ALLOWED", message: "Unable to continue" } },
          { status: 403 }
        )
      );
    }
    if (error instanceof NeonAuthConfigurationError) {
      return privateNoStore(
        Response.json(
          { error: { code: "AUTH_UNAVAILABLE", message: "Authentication is unavailable" } },
          { status: 503 }
        )
      );
    }
    return privateNoStore(
      Response.json(
        { error: { code: "PROCESSING_FAILED", message: "The request could not be completed" } },
        { status: 500 }
      )
    );
  }
}

export const GET = dispatch;
export const POST = dispatch;
