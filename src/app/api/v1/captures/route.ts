import { composeCaptureRoutes } from "@/lib/capture/composition";
import { createCaptureCollectionHandlers } from "@/lib/capture/http";

export async function POST(request: Request): Promise<Response> {
  return await createCaptureCollectionHandlers(await composeCaptureRoutes()).POST(request);
}

export async function GET(request: Request): Promise<Response> {
  return await createCaptureCollectionHandlers(await composeCaptureRoutes()).GET(request);
}
