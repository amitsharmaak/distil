import { readAuthEnvironment } from "@/lib/auth/environment";
import { requireRequestSession, requireSessionMutation } from "@/lib/auth/route-helpers";
import { getRepositorySet } from "@/lib/database";
import { readJson, readerErrorResponse } from "@/lib/phase2/reader-http";
import { parseBody, stateSchema, updateItemState } from "@/lib/phase2/reader-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireSessionMutation(request, readAuthEnvironment());
    const { id } = await context.params;
    if (!id) throw new Error("missing item id");
    const input = parseBody(await readJson(request), stateSchema);
    const item = await updateItemState(await getRepositorySet(), id, input);
    return Response.json({ item });
  } catch (error) {
    return readerErrorResponse(error);
  }
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireRequestSession(request, readAuthEnvironment());
    const { id } = await context.params;
    const item = await (await getRepositorySet()).items.findById(id);
    if (!item)
      return Response.json(
        { error: { code: "ITEM_NOT_FOUND", message: `Item with id "${id}" was not found` } },
        { status: 404 }
      );
    return Response.json({
      state: {
        isRead: item.isRead,
        archived: Boolean(item.archivedAt),
        archivedAt: item.archivedAt ?? null,
        readAt: item.readAt ?? null,
        readingProgress: item.readingProgress ?? 0,
        manualPriority: item.manualPriority ?? null,
      },
    });
  } catch (error) {
    return readerErrorResponse(error);
  }
}
