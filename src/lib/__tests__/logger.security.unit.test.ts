import { Writable } from "node:stream";
import pinoPretty from "pino-pretty";

import { createLogger, sanitizeLogError } from "@/lib/logger";

function capture() {
  let output = "";
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  return { destination, output: () => output };
}

const secretCanary = "dst_cap_abcdefghijklmnopqrstuvwxyz";
const urlCanary = "https://private.example.test/article?token=do-not-log";
const promptCanary = "private prompt and source content must not appear";
const identifiers = {
  userId: "11111111-1111-4111-8111-111111111111",
  actorId: "11111111-1111-4111-8111-111111111111",
  requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  code: "CAPTURE_FAILED",
};

function writeCanaries(logger: ReturnType<typeof createLogger>) {
  const error = Object.assign(new Error(`error message includes ${secretCanary}`), {
    code: identifiers.code,
  });
  logger.error(
    {
      ...identifiers,
      authorization: `Bearer ${secretCanary}`,
      cookie: `distil_session=${secretCanary}`,
      oauth: { accessToken: secretCanary, refreshToken: secretCanary },
      magicLink: `${urlCanary}#token=${secretCanary}`,
      url: urlCanary,
      query: "private search query",
      prompt: promptCanary,
      content: promptCanary,
      parameters: { url: urlCanary },
      result: { content: promptCanary },
      reasoning: promptCanary,
      err: error,
    },
    `untrusted message ${urlCanary} ${promptCanary}`
  );
  logger
    .child({ userId: identifiers.userId, url: urlCanary, prompt: promptCanary })
    .info({ code: "CHILD_EVENT" }, `child message ${urlCanary}`);
}

function expectCanariesRedacted(output: string) {
  expect(output).toContain(identifiers.userId);
  expect(output).toContain(identifiers.actorId);
  expect(output).toContain(identifiers.requestId);
  expect(output).toContain(identifiers.code);
  expect(output).not.toContain(secretCanary);
  expect(output).not.toContain(urlCanary);
  expect(output).not.toContain(promptCanary);
  expect(output).not.toContain("error message includes");
}

describe("central structured logger redaction", () => {
  it("preserves only an error type and stable error code", () => {
    const error = Object.assign(new Error(`do not retain ${promptCanary}`), {
      code: "CAPTURE_FAILED",
    });
    expect(sanitizeLogError(error)).toEqual({ type: "Error", code: "CAPTURE_FAILED" });
    expect(sanitizeLogError({ type: "Error", code: "CAPTURE_FAILED" })).toEqual({
      type: "Error",
      code: "CAPTURE_FAILED",
    });
  });

  it("allowlists opaque IDs and stable error codes while dropping sensitive canaries", () => {
    const sink = capture();
    writeCanaries(createLogger({ development: false, destination: sink.destination as never }));
    expectCanariesRedacted(sink.output());
  });

  it("keeps the same redaction boundary with a pretty development destination", () => {
    const sink = capture();
    const pretty = pinoPretty({ colorize: false, sync: true, destination: sink.destination });
    writeCanaries(createLogger({ development: true, destination: pretty }));
    expectCanariesRedacted(sink.output());
  });
});
