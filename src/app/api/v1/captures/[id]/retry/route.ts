import { composeCaptureRoutes } from "@/lib/capture/composition";
import { createCaptureRetryHandlers } from "@/lib/capture/http";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  return createCaptureRetryHandlers(await composeCaptureRoutes()).POST(request, context);
}
