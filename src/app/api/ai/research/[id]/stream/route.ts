import { getResearchReport } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/ai/research/[id]/stream — Stream research progress via SSE. */
export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params;

  const report = getResearchReport(id);
  if (!report) {
    return new Response("Report not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  let lastProgress = "";
  let lastStatus = "";

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: string) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      };

      const poll = async () => {
        const current = getResearchReport(id);
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
            }),
          );
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
