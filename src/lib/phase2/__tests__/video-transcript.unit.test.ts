import { hasTranscript, loadVideoTranscript } from "../video-transcript";

const baseItem = {
  id: "v1",
  url: "https://www.youtube.com/watch?v=mUAsaprJ66s",
  title: "T",
  author: "Greg",
  fullContent: "<h2>Description</h2>\n<p>About &amp; more</p>",
  detectedMedia: [{ type: "video", platform: "youtube", videoId: "mUAsaprJ66s" }],
};

function repositories(item: unknown) {
  return {
    items: { findById: jest.fn().mockResolvedValue(item), update: jest.fn() },
    summaries: { deleteForItem: jest.fn() },
  };
}

it("loads the transcript, rebuilds the body, marks the media and drops stale summaries", async () => {
  const repos = repositories(baseItem);
  const result = await loadVideoTranscript(repos as never, "v1", {
    fetchTranscript: jest.fn().mockResolvedValue([{ start: 0, text: "Hello there." }]),
  });
  expect(result.paragraphs).toBe(2);
  const patch = repos.items.update.mock.calls[0][1];
  expect(patch.fullContent).toContain("<h2>Description</h2>\n<p>About &amp; more</p>");
  expect(patch.fullContent).toContain("<h2>Transcript</h2>");
  expect(patch.detectedMedia).toEqual([
    { type: "video", platform: "youtube", videoId: "mUAsaprJ66s", transcript: true },
  ]);
  expect(repos.summaries.deleteForItem).toHaveBeenCalledWith("v1");
  expect(hasTranscript({ detectedMedia: patch.detectedMedia })).toBe(true);
});

it("resolves a YouTube video linked from an X post", async () => {
  const repos = repositories({
    ...baseItem,
    url: "https://x.com/a/status/1",
    fullContent: undefined,
    detectedMedia: [
      { type: "video", platform: "twitter", embedUrl: "https://video.twimg.com/v.mp4" },
      { type: "video", platform: "youtube", videoId: "mUAsaprJ66s", linked: true },
    ],
  });
  const fetchTranscript = jest.fn().mockResolvedValue([{ start: 0, text: "Hi." }]);
  await loadVideoTranscript(repos as never, "v1", { fetchTranscript });
  expect(fetchTranscript).toHaveBeenCalledWith("mUAsaprJ66s");
  const patch = repos.items.update.mock.calls[0][1];
  expect(patch.detectedMedia[0]).toEqual({
    type: "video",
    platform: "twitter",
    embedUrl: "https://video.twimg.com/v.mp4",
  });
  expect(patch.detectedMedia[1]).toMatchObject({ platform: "youtube", transcript: true });
});

it("is a no-op when the transcript is already loaded", async () => {
  const fetchTranscript = jest.fn();
  const repos = repositories({
    ...baseItem,
    detectedMedia: [{ type: "video", platform: "youtube", transcript: true }],
  });
  await expect(loadVideoTranscript(repos as never, "v1", { fetchTranscript })).resolves.toEqual({
    paragraphs: 0,
  });
  expect(fetchTranscript).not.toHaveBeenCalled();
  expect(repos.items.update).not.toHaveBeenCalled();
});

it("rejects non-video items and videos without captions", async () => {
  await expect(
    loadVideoTranscript(
      repositories({ ...baseItem, url: "https://example.com/a", detectedMedia: [] }) as never,
      "v1"
    )
  ).rejects.toMatchObject({ code: "INVALID_REQUEST", status: 400 });
  await expect(
    loadVideoTranscript(repositories(baseItem) as never, "v1", {
      fetchTranscript: jest.fn().mockResolvedValue([]),
    })
  ).rejects.toMatchObject({ code: "TRANSCRIPT_UNAVAILABLE", status: 404 });
  await expect(loadVideoTranscript(repositories(undefined) as never, "v1")).rejects.toMatchObject({
    code: "ITEM_NOT_FOUND",
  });
});
