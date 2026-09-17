export const dynamic = "force-dynamic";

/**
 * Preview deployments also report the function runtime so a dependency's
 * Node requirement can be checked against Vercel's actual Lambda version
 * without a Production change. Production keeps the minimal body.
 */
export async function GET(): Promise<Response> {
  const preview = process.env.VERCEL_ENV === "preview";
  return Response.json(
    {
      status: "ok",
      service: "distil",
      ...(preview ? { runtime: { node: process.versions.node } } : {}),
    },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
      },
    }
  );
}
