export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(
    {
      status: "ok",
      service: "distil",
    },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
      },
    }
  );
}
