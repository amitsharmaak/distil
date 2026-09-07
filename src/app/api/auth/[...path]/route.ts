import { getNeonAuthServer, NeonAuthConfigurationError } from "@/lib/auth/neon-server";
import { gatedNeonAuthHandler, type NeonAuthHandler } from "@/lib/auth/neon-route";

async function dispatch(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  try {
    const handlers = getNeonAuthServer().handler();
    const handler = handlers[request.method as keyof typeof handlers] as NeonAuthHandler | undefined;
    if (!handler) return new Response(null, { status: 405 });
    return gatedNeonAuthHandler(handler)(request, context);
  } catch (error) {
    if (error instanceof NeonAuthConfigurationError) {
      return Response.json(
        { error: { code: "AUTH_UNAVAILABLE", message: "Authentication is unavailable" } },
        { status: 503 }
      );
    }
    return Response.json(
      { error: { code: "PROCESSING_FAILED", message: "The request could not be completed" } },
      { status: 500 }
    );
  }
}

export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const DELETE = dispatch;
export const PATCH = dispatch;
