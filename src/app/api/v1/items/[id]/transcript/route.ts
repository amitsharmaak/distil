import { readAuthEnvironment } from "@/lib/auth/environment";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { getTenantRepositories } from "@/lib/database";
import { readerErrorResponse } from "@/lib/phase2/reader-http";
import { loadVideoTranscript } from "@/lib/phase2/video-transcript";
import { generateSummary } from "@/lib/ai/summarize";
import { aiLogger, sanitizeLogError } from "@/lib/logger";

/** Transcript fetch plus a summary on a thinking model can exceed the default. */
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/v1/items/:id/transcript — load a YouTube transcript into the item on demand. */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const auth = await resolveRequestAuthContext(request);
    const id = (await context.params).id;
    const repositories = await getTenantRepositories(auth);
    const result = await loadVideoTranscript(repositories, id);
    // Best effort: a brief summary built from the transcript. The reader can
    // still request one manually if the provider is unavailable.
    try {
      await generateSummary(auth, repositories, id, { length: "brief", force: true });
    } catch (error) {
      aiLogger.warn(
        { event: "transcript_summary_skipped", err: sanitizeLogError(error) },
        "Transcript summary generation skipped"
      );
    }
    return Response.json(result);
  } catch (error) {
    return readerErrorResponse(error);
  }
}
