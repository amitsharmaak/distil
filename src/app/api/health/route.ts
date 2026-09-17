import { createRequire } from "node:module";
import { resolve } from "node:path";

export const dynamic = "force-dynamic";

function previewRuntime() {
  const nodeRequire = createRequire(resolve(process.cwd(), "package.json"));
  const probe = (id: string) => {
    try {
      nodeRequire(id);
      return "ok";
    } catch (error) {
      return String(error).slice(0, 400);
    }
  };
  return {
    node: process.versions.node,
    execArgv: process.execArgv,
    nodeOptions: process.env.NODE_OPTIONS ?? null,
    requireModule: (process.features as { require_module?: boolean }).require_module ?? null,
    jsdom: probe("jsdom"),
    encodingLite: probe("@exodus/bytes/encoding-lite.js"),
  };
}

/**
 * Preview deployments also report the function runtime so a dependency's
 * Node requirement can be checked against Vercel's actual Lambda without a
 * Production change. Production keeps the minimal body.
 */
export async function GET(): Promise<Response> {
  const preview = process.env.VERCEL_ENV === "preview";
  return Response.json(
    {
      status: "ok",
      service: "distil",
      ...(preview ? { runtime: previewRuntime() } : {}),
    },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
      },
    }
  );
}
