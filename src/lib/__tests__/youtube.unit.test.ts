import {
  extractYouTubeId,
  fetchYouTubeTranscript,
  fetchYouTubeVideoDetails,
  formatDuration,
  parseTimedText,
  parseYouTubeWatchPage,
  renderYouTubeContent,
  transcriptToParagraphs,
} from "../youtube";

describe("extractYouTubeId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=mUAsaprJ66s", "mUAsaprJ66s"],
    ["https://youtu.be/mUAsaprJ66s?t=10", "mUAsaprJ66s"],
    ["https://m.youtube.com/shorts/mUAsaprJ66s", "mUAsaprJ66s"],
    ["https://www.youtube.com/embed/mUAsaprJ66s", "mUAsaprJ66s"],
    ["https://www.youtube.com/channel/UCabc", null],
    ["https://example.com/watch?v=mUAsaprJ66s", null],
  ])("%s → %s", (url, expected) => {
    expect(extractYouTubeId(url)).toBe(expected);
  });
});

describe("parseYouTubeWatchPage", () => {
  it("reads video details out of the embedded player response", () => {
    const html = `<script>var ytInitialPlayerResponse = {"videoDetails":{"videoId":"abc","title":"Hi \\"there\\"","author":"Greg","lengthSeconds":"1650","shortDescription":"Line one\\n\\nLine two https://x.y/z","thumbnail":{"thumbnails":[{"url":"s.jpg","width":120},{"url":"l.jpg","width":1280}]}},"microformat":{"playerMicroformatRenderer":{"publishDate":"2026-09-15"}}};var other = 1;</script>`;
    expect(parseYouTubeWatchPage(html)).toEqual({
      videoId: "abc",
      title: 'Hi "there"',
      author: "Greg",
      description: "Line one\n\nLine two https://x.y/z",
      lengthSeconds: 1650,
      thumbnailUrl: "l.jpg",
      publishDate: "2026-09-15",
    });
  });

  it("returns null when the page has no player response", () => {
    expect(parseYouTubeWatchPage("<html></html>")).toBeNull();
  });
});

describe("parseTimedText", () => {
  it("parses srv3 word segments and decodes double-encoded entities", () => {
    const xml =
      '<timedtext format="3"><body><p t="80" d="4800"><s>Yeah,</s><s t="240"> you&amp;#39;ve</s></p><p t="5000" d="10"><s>next</s></p></body></timedtext>';
    expect(parseTimedText(xml)).toEqual([
      { start: 0.08, text: "Yeah, you've" },
      { start: 5, text: "next" },
    ]);
  });

  it("parses the srv1 <text> format", () => {
    expect(
      parseTimedText('<transcript><text start="1.5" dur="2">Hello &amp; bye</text></transcript>')
    ).toEqual([{ start: 1.5, text: "Hello & bye" }]);
  });
});

describe("transcriptToParagraphs", () => {
  it("breaks at sentence ends once the window has elapsed", () => {
    const segments = [
      { start: 0, text: "One." },
      { start: 30, text: "Two" },
      { start: 65, text: "three." },
      { start: 70, text: "Four." },
    ];
    expect(transcriptToParagraphs(segments, 60)).toEqual([
      { start: 0, text: "One. Two three." },
      { start: 70, text: "Four." },
    ]);
  });
});

describe("transcript cleanup", () => {
  it("drops sound tags and breaks paragraphs on speaker changes", () => {
    const segments = parseTimedText(
      '<p t="0"><s>Hi</s><s> [music]</s><s> there.</s></p><p t="1000"><s>&gt;&gt; Second</s><s> voice.</s></p>'
    );
    expect(segments).toEqual([
      { start: 0, text: "Hi there." },
      { start: 1, text: ">> Second voice." },
    ]);
    expect(transcriptToParagraphs(segments, 60)).toEqual([
      { start: 0, text: "Hi there." },
      { start: 1, text: "Second voice." },
    ]);
  });
});

describe("renderYouTubeContent", () => {
  it("renders description and a timestamped transcript", () => {
    const rendered = renderYouTubeContent(
      {
        videoId: "abc",
        title: "T",
        author: null,
        description: "Intro <b>\n\nSee https://a.b/c",
        lengthSeconds: 90,
        thumbnailUrl: null,
        publishDate: null,
      },
      [
        { start: 0, text: "Hello." },
        { start: 75, text: "World." },
      ]
    );
    expect(rendered.html).toBe(
      [
        "<h2>Description</h2>",
        "<p>Intro &lt;b&gt;</p>",
        '<p>See <a href="https://a.b/c">https://a.b/c</a></p>',
        "<h2>Transcript</h2>",
        '<p><a href="https://www.youtube.com/watch?v=abc&t=0s">0:00</a> Hello. World.</p>',
      ].join("\n")
    );
    expect(rendered.text).toBe("Intro <b>\n\nSee https://a.b/c\n\nHello. World.");
  });
});

describe("fetchYouTubeTranscript", () => {
  it("prefers a human English track and parses it", async () => {
    const fetchImpl = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/youtubei/v1/player")) {
        return new Response(
          JSON.stringify({
            captions: {
              playerCaptionsTracklistRenderer: {
                captionTracks: [
                  {
                    baseUrl: "https://www.youtube.com/api/timedtext?asr",
                    languageCode: "en",
                    kind: "asr",
                  },
                  { baseUrl: "https://www.youtube.com/api/timedtext?human", languageCode: "en" },
                ],
              },
            },
          })
        );
      }
      expect(url).toBe("https://www.youtube.com/api/timedtext?human");
      return new Response('<text start="0" dur="1">Hi</text>');
    });
    await expect(
      fetchYouTubeTranscript("abc", fetchImpl as unknown as typeof fetch)
    ).resolves.toEqual([{ start: 0, text: "Hi" }]);
  });

  it("returns an empty transcript when YouTube declines", async () => {
    const fetchImpl = jest.fn(async () => new Response("", { status: 403 }));
    await expect(
      fetchYouTubeTranscript("abc", fetchImpl as unknown as typeof fetch)
    ).resolves.toEqual([]);
  });
});

it("formats durations", () => {
  expect(formatDuration(1650)).toBe("27:30");
  expect(formatDuration(3725)).toBe("1:02:05");
  expect(formatDuration(5)).toBe("0:05");
});

describe("fetchYouTubeVideoDetails", () => {
  it("uses innertube's videoDetails when the watch page had none", async () => {
    const fetchImpl = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            videoDetails: {
              videoId: "abc",
              title: "Jev",
              author: "Greg",
              lengthSeconds: "1704",
              shortDescription: "About",
              thumbnail: { thumbnails: [{ url: "t.jpg", width: 1280 }] },
            },
          })
        )
    );
    await expect(
      fetchYouTubeVideoDetails("abc", fetchImpl as unknown as typeof fetch)
    ).resolves.toEqual({
      videoId: "abc",
      title: "Jev",
      author: "Greg",
      description: "About",
      lengthSeconds: 1704,
      thumbnailUrl: "t.jpg",
      publishDate: null,
    });
  });

  it("falls back to oEmbed, then gives up", async () => {
    const fetchImpl = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/youtubei/")) return new Response("", { status: 403 });
      if (url.includes("/oembed"))
        return new Response(
          JSON.stringify({ title: "Jev", author_name: "Greg", thumbnail_url: "o.jpg" })
        );
      return new Response("", { status: 404 });
    });
    await expect(
      fetchYouTubeVideoDetails("abc", fetchImpl as unknown as typeof fetch)
    ).resolves.toMatchObject({
      title: "Jev",
      author: "Greg",
      thumbnailUrl: "o.jpg",
      description: "",
    });
    const down = jest.fn(async () => new Response("", { status: 500 }));
    await expect(
      fetchYouTubeVideoDetails("abc", down as unknown as typeof fetch)
    ).resolves.toBeNull();
  });
});
