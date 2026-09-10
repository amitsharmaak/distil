import { CaptureProcessingError, CaptureRetryScheduledError } from "../errors";
import { createCaptureQueueMessageV2 } from "@/lib/contracts/tenant-jobs";
import { CaptureWorker, createDefaultCaptureProcessor } from "../worker";
import {
  captureQueueMessage,
  captureRecord,
  context,
  MemoryCaptureRepository,
  publicDns,
} from "./fixtures";

describe("CaptureWorker state machine", () => {
  const now = () => new Date("2026-01-01T01:00:00.000Z");

  it("transitions queued to processing to ready and records the item", async () => {
    const record = captureRecord();
    const captures = new MemoryCaptureRepository([record]);
    const worker = new CaptureWorker({
      context,
      captures,
      processor: jest.fn().mockResolvedValue({ status: "ready", itemId: "item-1" }),
      now,
    });
    await expect(worker.handle(captureQueueMessage(record.id))).resolves.toMatchObject({
      status: "ready",
      attempts: 1,
      itemId: "item-1",
    });
  });

  it("transitions queued to processing to rejected for rejected content", async () => {
    const record = captureRecord();
    const captures = new MemoryCaptureRepository([record]);
    const worker = new CaptureWorker({
      context,
      captures,
      processor: jest.fn().mockResolvedValue({ status: "rejected", reason: "not an article" }),
      now,
    });
    await expect(worker.handle(captureQueueMessage(record.id))).resolves.toMatchObject({
      status: "rejected",
      retryable: false,
      lastErrorCode: "CONTENT_REJECTED",
    });
  });

  it("transitions processing back to queued and asks the queue to retry a transient failure", async () => {
    const record = captureRecord();
    const captures = new MemoryCaptureRepository([record]);
    const worker = new CaptureWorker({
      context,
      captures,
      processor: jest
        .fn()
        .mockRejectedValue(new CaptureProcessingError("UPSTREAM_503", "busy", "transient")),
      now,
    });
    await expect(worker.handle(captureQueueMessage(record.id))).rejects.toBeInstanceOf(
      CaptureRetryScheduledError
    );
    await expect(captures.findById(record.id)).resolves.toMatchObject({
      status: "queued",
      retryable: true,
      attempts: 1,
    });
  });

  it("transitions processing to failed after five transient attempts", async () => {
    const record = captureRecord({ attempts: 4 });
    const captures = new MemoryCaptureRepository([record]);
    const worker = new CaptureWorker({
      context,
      captures,
      processor: jest
        .fn()
        .mockRejectedValue(new CaptureProcessingError("UPSTREAM_429", "limited", "transient")),
      now,
    });
    await expect(worker.handle(captureQueueMessage(record.id))).resolves.toMatchObject({
      status: "failed",
      retryable: false,
      attempts: 5,
    });
  });

  it("transitions processing directly to failed for definitive upstream 4xx", async () => {
    const record = captureRecord();
    const captures = new MemoryCaptureRepository([record]);
    const worker = new CaptureWorker({
      context,
      captures,
      processor: jest
        .fn()
        .mockRejectedValue(new CaptureProcessingError("UPSTREAM_404", "missing", "terminal")),
      now,
    });
    await expect(worker.handle(captureQueueMessage(record.id))).resolves.toMatchObject({
      status: "failed",
      retryable: false,
      attempts: 1,
    });
  });

  it("transitions processing to rejected for an unsafe redirect", async () => {
    const record = captureRecord();
    const captures = new MemoryCaptureRepository([record]);
    const worker = new CaptureWorker({
      context,
      captures,
      processor: jest
        .fn()
        .mockRejectedValue(new CaptureProcessingError("UNSAFE_URL", "private", "rejected")),
      now,
    });
    await expect(worker.handle(captureQueueMessage(record.id))).resolves.toMatchObject({
      status: "rejected",
      retryable: false,
    });
  });

  test.each(["ready", "rejected", "failed"] as const)(
    "treats duplicate delivery after terminal %s as a no-op",
    async (status) => {
      const processor = jest.fn();
      const record = captureRecord({ status });
      const result = await new CaptureWorker({
        context,
        captures: new MemoryCaptureRepository([record]),
        processor,
        now,
      }).handle(captureQueueMessage(record.id));
      expect(result?.status).toBe(status);
      expect(processor).not.toHaveBeenCalled();
    }
  );

  it("leaves a recently processing capture alone on concurrent duplicate delivery", async () => {
    const processor = jest.fn();
    const record = captureRecord({ status: "processing", updatedAt: "2026-01-01T00:59:00.000Z" });
    await expect(
      new CaptureWorker({
        context,
        captures: new MemoryCaptureRepository([record]),
        processor,
        now,
      }).handle(captureQueueMessage(record.id))
    ).rejects.toBeInstanceOf(CaptureRetryScheduledError);
    expect(processor).not.toHaveBeenCalled();
  });

  it("recovers a stale processing capture after a worker crash", async () => {
    const record = captureRecord({
      status: "processing",
      attempts: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const captures = new MemoryCaptureRepository([record]);
    const result = await new CaptureWorker({
      context,
      captures,
      processor: jest.fn().mockResolvedValue({ status: "ready", itemId: "item-1" }),
      now,
    }).handle(captureQueueMessage(record.id));
    expect(result).toMatchObject({ status: "ready", attempts: 2, itemId: "item-1" });
  });

  it("rejects malformed queue messages and ignores missing captures", async () => {
    const worker = new CaptureWorker({
      context,
      captures: new MemoryCaptureRepository(),
      processor: jest.fn(),
      now,
    });
    await expect(
      worker.handle({ version: 2, captureId: "secret", extra: true })
    ).rejects.toMatchObject({
      name: "ZodError",
    });
    await expect(
      worker.handle(captureQueueMessage("10000000-0000-4000-8000-000000000099"))
    ).resolves.toBeUndefined();
  });

  it("audits and acknowledges a forged tenant envelope without reading the target", async () => {
    const captures = new MemoryCaptureRepository([captureRecord()]);
    const find = jest.spyOn(captures, "findById");
    const audit = jest.fn();
    const worker = new CaptureWorker({ context, captures, processor: jest.fn(), audit, now });
    const forged = createCaptureQueueMessageV2({
      userId: "20000000-0000-4000-8000-000000000020",
      captureId: captureRecord().id,
      traceId: context.requestId,
    });

    await expect(worker.handle(forged)).resolves.toBeUndefined();
    expect(find).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith({
      action: "capture_queue_owner_mismatch_or_missing",
      traceId: context.requestId,
    });
  });

  it("returns the current record when a stale-worker recovery loses its transition race", async () => {
    const record = captureRecord({
      status: "processing",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const captures = new MemoryCaptureRepository([record]);
    jest.spyOn(captures, "transition").mockResolvedValueOnce(undefined);

    await expect(
      new CaptureWorker({
        context,
        captures,
        processor: jest.fn(),
        now,
        staleAfterMs: 1,
      }).handle(captureQueueMessage(record.id))
    ).resolves.toMatchObject({ id: record.id, status: "processing" });
  });

  it("does not process a capture when another worker claims its queued transition", async () => {
    const record = captureRecord();
    const captures = new MemoryCaptureRepository([record]);
    jest.spyOn(captures, "transition").mockResolvedValueOnce(undefined);
    const processor = jest.fn();

    await expect(
      new CaptureWorker({ context, captures, processor, now }).handle(
        captureQueueMessage(record.id)
      )
    ).resolves.toMatchObject({ id: record.id, status: "queued" });
    expect(processor).not.toHaveBeenCalled();
  });

  it("uses the generic rejection reason when a processor deliberately withholds one", async () => {
    const captures = new MemoryCaptureRepository([captureRecord()]);

    await expect(
      new CaptureWorker({
        context,
        captures,
        processor: jest.fn().mockResolvedValue({ status: "rejected" }),
        now,
      }).handle(captureQueueMessage(captureRecord().id))
    ).resolves.toMatchObject({
      status: "rejected",
      lastErrorMessage: "The source was not accepted as readable content",
    });
  });
});

describe("default capture processor", () => {
  const readableArticle = `<!doctype html>
    <html>
      <head>
        <title>Harvey raises another round | Example News</title>
        <meta property="og:title" content="Harvey raises another round">
        <meta property="og:description" content="The legal AI company has raised fresh funding.">
        <meta property="og:site_name" content="Example News">
        <meta name="author" content="Julie Reporter">
      </head>
      <body>
        <header><nav>Latest Startups Venture Events Newsletters Subscribe Sign in</nav></header>
        <main><article>
          <h1>Harvey raises another round</h1>
          <p>The legal AI company has raised another large funding round after sustained growth.</p>
          <p>The investment will support product development and expansion into new markets.</p>
          <p>Executives said customer demand continued to increase throughout the year.</p>
        </article></main>
        <aside>More stories, promotions, conference tickets, and unrelated navigation links.</aside>
      </body>
    </html>`;
  const extractedArticle = {
    title: "Harvey raises another round",
    byline: "Julie Reporter",
    content: `<article>
      <h1>Harvey raises another round</h1>
      <p>The legal AI company has raised another large funding round after sustained growth.</p>
      <p>The investment will support product development and expansion into new markets.</p>
      <p>Executives said customer demand continued to increase throughout the year.</p>
    </article>`,
    textContent:
      "The legal AI company has raised another large funding round after sustained growth. " +
      "The investment will support product development and expansion into new markets. " +
      "Executives said customer demand continued to increase throughout the year.",
    extractedLinks: [],
  };
  const fetchOptions = {
    resolve: publicDns,
    fetch: jest
      .fn()
      .mockImplementation(
        async () => new Response(readableArticle, { headers: { "content-type": "text/html" } })
      ),
  };

  it("durably accepts raw content even when asynchronous AI enrichment is out of quota", async () => {
    const rawContent = { insert: jest.fn(), attachItem: jest.fn() };
    const item = { id: captureRecord().id };
    const items = {
      findByNormalizedUrl: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockResolvedValue(item),
    };
    const enqueueEnrichment = jest.fn().mockRejectedValue(new Error("AI_QUOTA_EXHAUSTED"));
    const processor = createDefaultCaptureProcessor({
      context,
      items: items as never,
      rawContent: rawContent as never,
      enqueueEnrichment,
      extractContent: jest.fn().mockReturnValue(extractedArticle),
      fetchOptions: {
        resolve: publicDns,
        fetch: jest.fn().mockResolvedValue(new Response(readableArticle)),
      },
    });

    await expect(processor(captureRecord())).resolves.toEqual({
      status: "ready",
      itemId: captureRecord().id,
    });
    expect(rawContent.insert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: context.userId, id: captureRecord().id })
    );
    expect(items.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        processingStatus: "ready",
        title: "Harvey raises another round",
        summary: "The legal AI company has raised fresh funding.",
        author: "Julie Reporter",
        publication: "Example News",
        fullContent: expect.stringContaining("The legal AI company"),
      })
    );
    expect(items.insert.mock.calls[0][0].fullContent).not.toContain("Latest Startups Venture");
    expect(items.insert.mock.calls[0][0].fullContent).not.toContain("conference tickets");
    expect(rawContent.attachItem).toHaveBeenCalled();
  });

  it("rejects a navigation shell instead of marking page chrome as readable content", async () => {
    const rawContent = { insert: jest.fn(), attachItem: jest.fn() };
    const items = {
      findByNormalizedUrl: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn(),
    };
    const processor = createDefaultCaptureProcessor({
      context,
      items: items as never,
      rawContent: rawContent as never,
      extractContent: jest.fn().mockReturnValue(null),
      fetchOptions: {
        resolve: publicDns,
        fetch: jest
          .fn()
          .mockResolvedValue(new Response("<html><body><nav>Home Sign in</nav></body></html>")),
      },
    });

    await expect(processor(captureRecord())).resolves.toEqual({
      status: "rejected",
      reason: "Distil could not identify enough readable article content on this page",
    });
    expect(rawContent.insert).toHaveBeenCalled();
    expect(items.insert).not.toHaveBeenCalled();
    expect(rawContent.attachItem).not.toHaveBeenCalled();
  });

  it("preserves capture overrides and falls back to extracted metadata", async () => {
    const rawContent = { insert: jest.fn(), attachItem: jest.fn() };
    const items = {
      findByNormalizedUrl: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockImplementation(async (item) => item),
    };
    const extractContent = jest.fn().mockReturnValue({
      ...extractedArticle,
      title: "Extractor title",
      byline: null,
      textContent: "A compact readable article body. ".repeat(4),
    });
    const processor = createDefaultCaptureProcessor({
      context,
      items: items as never,
      rawContent: rawContent as never,
      extractContent,
      fetchOptions: {
        resolve: publicDns,
        fetch: jest.fn().mockResolvedValue(
          new Response(`<!doctype html><html><head>
            <meta name="author" content="Metadata Author">
          </head><body>${extractedArticle.content}</body></html>`)
        ),
      },
    });

    await expect(
      processor(captureRecord({ title: "Saved title", notes: "Saved note" }))
    ).resolves.toEqual({ status: "ready", itemId: captureRecord().id });
    expect(items.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Saved title",
        summary: "Saved note",
        author: "Metadata Author",
        publication: undefined,
        thumbnailUrl: undefined,
      })
    );
  });

  it("uses extracted title and body text when page metadata is absent", async () => {
    const rawContent = { insert: jest.fn(), attachItem: jest.fn() };
    const items = {
      findByNormalizedUrl: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockImplementation(async (item) => item),
    };
    const readableText = "A readable sentence without page metadata. ".repeat(3).trim();
    const processor = createDefaultCaptureProcessor({
      context,
      items: items as never,
      rawContent: rawContent as never,
      extractContent: jest.fn().mockReturnValue({
        ...extractedArticle,
        title: "Extractor title",
        byline: null,
        textContent: readableText,
      }),
      fetchOptions: {
        resolve: publicDns,
        fetch: jest.fn().mockResolvedValue(new Response("<html><body>article</body></html>")),
      },
    });

    await processor(captureRecord());

    expect(items.insert).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Extractor title", summary: readableText })
    );
  });

  it("requires a raw-content repository for the durable non-pipeline path", async () => {
    const processor = createDefaultCaptureProcessor({
      context,
      items: { findByNormalizedUrl: jest.fn(), insert: jest.fn() } as never,
      fetchOptions,
    });

    await expect(processor(captureRecord())).rejects.toThrow("rawContent repository is required");
  });

  it("preserves a browser-extension source and reuses an existing tenant item", async () => {
    const rawContent = { insert: jest.fn(), attachItem: jest.fn() };
    const existing = { id: "existing-item" };
    const items = { findByNormalizedUrl: jest.fn().mockResolvedValue(existing), insert: jest.fn() };
    const processor = createDefaultCaptureProcessor({
      context,
      items: items as never,
      rawContent: rawContent as never,
      fetchOptions,
    });

    await expect(processor(captureRecord({ source: "browser-extension" }))).resolves.toEqual({
      status: "ready",
      itemId: existing.id,
    });
    expect(rawContent.insert).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "browser-extension" })
    );
    expect(items.insert).not.toHaveBeenCalled();
  });

  it("uses the pipeline result when it returns an item and fails closed when it does not", async () => {
    const items = { findByNormalizedUrl: jest.fn() };
    const accepted = createDefaultCaptureProcessor({
      context,
      items: items as never,
      pipeline: jest.fn().mockResolvedValue({ status: "ready", itemId: "pipeline-item" }),
      fetchOptions,
    });
    await expect(accepted(captureRecord())).resolves.toEqual({
      status: "ready",
      itemId: "pipeline-item",
    });

    items.findByNormalizedUrl.mockResolvedValue(undefined);
    const incomplete = createDefaultCaptureProcessor({
      context,
      items: items as never,
      pipeline: jest.fn().mockResolvedValue({ status: "ready" }),
      fetchOptions,
    });
    await expect(incomplete(captureRecord())).rejects.toMatchObject({ code: "PROCESSING_FAILED" });
  });

  it("awaits durable pipeline work and resolves the canonical item", async () => {
    const item = { id: "item-1" };
    const items = { findByNormalizedUrl: jest.fn().mockResolvedValue(item) };
    const pipeline = jest.fn().mockResolvedValue({ rawContentId: "raw", status: "ready" });
    const processor = createDefaultCaptureProcessor({
      context,
      items: items as never,
      pipeline,
      fetchOptions: {
        resolve: publicDns,
        fetch: jest.fn().mockResolvedValue(
          new Response("<article>Readable</article>", {
            headers: { "content-type": "text/html" },
          })
        ),
      },
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });
    await expect(processor(captureRecord())).resolves.toEqual({
      status: "ready",
      itemId: "item-1",
    });
    expect(pipeline).toHaveBeenCalledWith(
      expect.objectContaining({ id: captureRecord().id, rawBody: expect.any(String) })
    );
  });

  it("never reports success without a durable item", async () => {
    const processor = createDefaultCaptureProcessor({
      context,
      items: { findByNormalizedUrl: jest.fn().mockResolvedValue(undefined) } as never,
      pipeline: jest.fn().mockResolvedValue({ rawContentId: "raw", status: "ready" }),
      fetchOptions: {
        resolve: publicDns,
        fetch: jest.fn().mockResolvedValue(
          new Response("<article>Readable</article>", {
            headers: { "content-type": "text/html" },
          })
        ),
      },
    });
    await expect(processor(captureRecord())).rejects.toMatchObject({
      code: "PROCESSING_FAILED",
      kind: "transient",
    });
  });

  it("resolves a redirected capture by its final normalized URL", async () => {
    const findByNormalizedUrl = jest.fn().mockResolvedValue({ id: "redirected-item" });
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://final.example.com/story?utm_source=redirect" },
        })
      )
      .mockResolvedValueOnce(
        new Response("<article>Readable</article>", {
          headers: { "content-type": "text/html" },
        })
      );
    const processor = createDefaultCaptureProcessor({
      context,
      items: { findByNormalizedUrl } as never,
      pipeline: jest.fn().mockResolvedValue({ rawContentId: "raw", status: "ready" }),
      fetchOptions: { resolve: publicDns, fetch },
    });

    await expect(processor(captureRecord())).resolves.toEqual({
      status: "ready",
      itemId: "redirected-item",
    });
    expect(findByNormalizedUrl).toHaveBeenCalledWith("https://final.example.com/story");
  });
});
