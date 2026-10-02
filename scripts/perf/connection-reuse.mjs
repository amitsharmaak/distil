/**
 * Read-only production transport probe. Four GETs to the public static logo;
 * no cookies, application data, database access or browser instrumentation.
 *
 * node scripts/perf/connection-reuse.mjs
 * node scripts/perf/connection-reuse.mjs --keepalive
 *
 * Compare on the usual network and a phone hotspot. --keepalive sends HTTP/2
 * PINGs during the 30-second idle gap as a diagnostic control, not an app fix.
 */
import http2 from "node:http2";
import { setTimeout as delay } from "node:timers/promises";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--keepalive")) {
  throw new Error("Usage: node scripts/perf/connection-reuse.mjs [--keepalive]");
}

const keepalive = args.includes("--keepalive");
const started = performance.now();
const sessions = new Set();
const emit = (event, details = {}) =>
  console.log(
    JSON.stringify({ elapsedMs: Math.round(performance.now() - started), event, ...details })
  );

function connect(label) {
  const session = http2.connect("https://distilai.app");
  sessions.add(session);
  session.on("connect", () =>
    emit("connected", {
      label,
      protocol: session.alpnProtocol,
      address: session.socket.remoteAddress,
    })
  );
  session.on("goaway", (code) => emit("goaway", { label, code }));
  session.on("error", (error) => emit("sessionError", { label, code: error.code }));
  session.on("close", () => {
    sessions.delete(session);
    emit("closed", { label });
  });
  return session;
}

function ping(session, label) {
  if (session.connecting || session.closed || session.destroyed) return;
  session.ping((error, duration) =>
    emit("ping", {
      label,
      durationMs: error ? null : Math.round(duration),
      code: error?.code,
    })
  );
}

function request(session, label, sample) {
  if (session.closed || session.destroyed) {
    emit("unavailable", { label, sample });
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const start = performance.now();
    let status = null;
    let finished = false;
    const stream = session.request({ ":path": "/logo.svg" });
    const finish = (event, code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      emit(event, {
        label,
        sample,
        status,
        durationMs: Math.round(performance.now() - start),
        code,
      });
      resolve(event === "complete" && status === 200);
    };
    const timer = setTimeout(() => {
      finish("timeout");
      session.destroy();
    }, 12_000);
    stream.on("response", (headers) => {
      status = headers[":status"];
    });
    stream.on("data", () => {});
    stream.on("end", () => finish(status === null ? "endedWithoutHeaders" : "complete"));
    stream.on("error", (error) => finish("requestError", error.code));
    stream.on("close", () => finish("closedBeforeComplete"));
    stream.end();
    ping(session, `${label}-${sample}`);
  });
}

emit("start", { origin: "https://distilai.app", path: "/logo.svg", idleMs: 30_000, keepalive });
const reused = connect("reused");
const heartbeat = keepalive ? setInterval(() => ping(reused, "keepalive"), 5_000) : null;
let passed = true;
try {
  for (const sample of [1, 2]) {
    if (sample === 2) await delay(30_000);
    emit("sampleStart", { sample });
    const fresh = connect(`fresh-${sample}`);
    const results = await Promise.all([
      request(reused, "reused", sample),
      request(fresh, "fresh", sample).finally(() => fresh.destroy()),
    ]);
    passed = results.every(Boolean) && passed;
  }
} finally {
  clearInterval(heartbeat);
  for (const session of sessions) session.destroy();
}
emit("finished", { passed });
if (!passed) process.exitCode = 1;
