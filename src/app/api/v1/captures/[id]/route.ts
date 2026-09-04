import { composeCaptureRoutes } from "@/lib/capture/composition";
import { createCaptureResourceHandlers } from "@/lib/capture/http";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  return createCaptureResourceHandlers(await composeCaptureRoutes()).GET(request, context);
}
