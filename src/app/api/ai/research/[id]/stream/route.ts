import { requireTenantRoute, tenantRouteFailureResponse } from "@/lib/auth/tenant-route";

type RouteContext = { params: Promise<{ id: string }> };

/** Vercel Hobby ceiling; the stream closes itself before this is reached. */
export const maxDuration = 60;
/** Close the stream before the function is killed so the client can resume. */
const STREAM_DEADLINE_MS = 50_000;

/** GET /api/ai/research/[id]/stream — Stream research progress via SSE. */
export async function GET(req: Request, context: RouteContext) {
  let repositories;
  let id: string;
  let report;
  try {
    ({ repositories } = await requireTenantRoute(req));
    ({ id } = await context.params);
    report = await repositories.research.findReport(id);
  } catch (error) {
    return tenantRouteFailureResponse(error);
  }
  if (!report) {
    return new Response("Report not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  let lastProgress = "";
  let lastStatus = "";
  const deadline = Date.now() + STREAM_DEADLINE_MS;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: string) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      };

      const poll = async () => {
        const current = await repositories.research.findReport(id);
        if (!current) {
          sendEvent("error", JSON.stringify({ message: "Report not found" }));
          controller.close();
          return;
        }

        const progressStr = current.progress ?? "";
        if (progressStr !== lastProgress) {
          lastProgress = progressStr;
          if (progressStr) {
            sendEvent("progress", progressStr);
          }
        }

        if (current.status !== lastStatus) {
          lastStatus = current.status;
          sendEvent("status", JSON.stringify({ status: current.status }));
        }

        if (current.status === "completed" || current.status === "failed") {
          sendEvent(
            "complete",
            JSON.stringify({
              status: current.status,
              report: current.status === "completed" ? current.report : undefined,
            })
          );
          controller.close();
          return;
        }

        if (Date.now() >= deadline) {
          // Tell the client we are still running and let it reconnect or poll.
          sendEvent("timeout", JSON.stringify({ status: current.status }));
          controller.close();
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
        await poll();
      };

      await poll();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
