export const dynamic = "force-dynamic";

/**
 * Preview deployments also report the function runtime (Node version and
 * whether `require(esm)` is enabled) so a dependency's loading behaviour can
 * be checked against Vercel's actual Lambda flags without a Production change.
 * Production keeps the minimal body.
 */
export async function GET(): Promise<Response> {
  const preview = process.env.VERCEL_ENV === "preview";
  return Response.json(
    {
      status: "ok",
      service: "distil",
      ...(preview
        ? {
            runtime: {
              node: process.versions.node,
              requireModule:
                (process.features as { require_module?: boolean }).require_module ?? null,
            },
          }
        : {}),
    },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
      },
    }
  );
}
