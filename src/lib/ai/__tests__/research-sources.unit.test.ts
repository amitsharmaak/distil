import {
  buildSourceCatalog,
  extractRecalledSources,
  finalizeCitations,
  formatSourceList,
  isGroundingRedirect,
  resolveGroundingRedirects,
  scrapeUrlSources,
  sourceDomain,
  type ResearchSource,
} from "../research-sources";

const redirect = (id: string) =>
  `https://vertexaisearch.cloud.google.com/grounding-api-redirect/${id}`;

function redirectResponse(location: string | null, status = 302): Response {
  return new Response(null, { status, headers: location ? { location } : {} });
}

describe("resolveGroundingRedirects", () => {
  it("replaces a redirect with its Location, keeping the grounding title", async () => {
    const fetchImpl = jest.fn(async () => redirectResponse("https://www.who.int/news/item/1"));
    await expect(
      resolveGroundingRedirects([{ url: redirect("a"), title: "who.int" }], { fetchImpl })
    ).resolves.toEqual([{ url: "https://www.who.int/news/item/1", title: "who.int" }]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      redirect("a"),
      expect.objectContaining({ method: "GET", redirect: "manual", signal: expect.any(Object) })
    );
  });

  it("falls back to the final domain when grounding gave no title", async () => {
    const fetchImpl = jest.fn(async () => redirectResponse("https://www.example.org/x"));
    await expect(
      resolveGroundingRedirects([{ url: redirect("a"), title: "" }], { fetchImpl })
    ).resolves.toEqual([{ url: "https://www.example.org/x", title: "example.org" }]);
  });

  it("keeps the redirect when the request times out", async () => {
    const fetchImpl = jest.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        })
    );
    await expect(
      resolveGroundingRedirects([{ url: redirect("slow"), title: "slow.example" }], {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        timeoutMs: 20,
      })
    ).resolves.toEqual([{ url: redirect("slow"), title: "slow.example" }]);
  });

  it("keeps the redirect on errors, non-redirect statuses and unsafe locations", async () => {
    const responses = [
      Promise.reject(new Error("network")),
      Promise.resolve(redirectResponse(null, 200)),
      Promise.resolve(redirectResponse("/relative/path")),
      Promise.resolve(redirectResponse("javascript:alert(1)")),
      Promise.resolve(redirectResponse(redirect("loop"))),
      Promise.resolve(redirectResponse(null, 302)),
    ];
    const fetchImpl = jest.fn(() => responses.shift()!);
    const input = ["e", "ok", "rel", "js", "loop", "none"].map((id) => ({
      url: redirect(id),
      title: `${id}.example`,
    }));
    await expect(
      resolveGroundingRedirects(input, { fetchImpl: fetchImpl as unknown as typeof fetch })
    ).resolves.toEqual(input);
  });

  it("resolves at most the capped number and never requests other hosts", async () => {
    const fetchImpl = jest.fn(async (url: RequestInfo | URL) =>
      redirectResponse(`https://final.example/${String(url).split("/").pop()}`)
    );
    const input = [
      { url: "https://news.example/story", title: "" },
      { url: "http://vertexaisearch.cloud.google.com/grounding-api-redirect/insecure", title: "" },
      { url: "https://vertexaisearch.cloud.google.com/other/path", title: "" },
      { url: redirect("1"), title: "one.example" },
      { url: redirect("2"), title: "two.example" },
      { url: redirect("3"), title: "three.example" },
    ];
    const result = await resolveGroundingRedirects(input, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxResolutions: 2,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([redirect("1"), redirect("2")]);
    expect(result).toEqual([
      { url: "https://news.example/story", title: "news.example" },
      {
        url: "http://vertexaisearch.cloud.google.com/grounding-api-redirect/insecure",
        title: "vertexaisearch.cloud.google.com",
      },
      {
        url: "https://vertexaisearch.cloud.google.com/other/path",
        title: "vertexaisearch.cloud.google.com",
      },
      { url: "https://final.example/1", title: "one.example" },
      { url: "https://final.example/2", title: "two.example" },
      { url: redirect("3"), title: "three.example" },
    ]);
  });

  it("de-duplicates redirects that resolve to the same page", async () => {
    const fetchImpl = jest.fn(async () => redirectResponse("https://same.example/page/"));
    await expect(
      resolveGroundingRedirects(
        [
          { url: redirect("a"), title: "same.example" },
          { url: redirect("b"), title: "same.example" },
        ],
        { fetchImpl }
      )
    ).resolves.toHaveLength(1);
  });
});

describe("source helpers", () => {
  it("recognises only https grounding redirect links", () => {
    expect(isGroundingRedirect(redirect("x"))).toBe(true);
    expect(isGroundingRedirect("https://evil.example/grounding-api-redirect/x")).toBe(false);
    expect(isGroundingRedirect("not a url")).toBe(false);
  });

  it("uses the grounding title as the domain of an unresolved redirect", () => {
    expect(sourceDomain(redirect("x"), "www.Reuters.com")).toBe("reuters.com");
    expect(sourceDomain(redirect("x"), "Some Title")).toBe("vertexaisearch.cloud.google.com");
    expect(sourceDomain("https://www.bbc.co.uk/news")).toBe("bbc.co.uk");
  });

  it("scrapes legacy URLs without trailing punctuation, de-duplicated", () => {
    expect(
      scrapeUrlSources("See (https://a.example/x), https://a.example/x/ and https://b.example.")
    ).toEqual([
      { url: "https://a.example/x", title: "a.example" },
      { url: "https://b.example", title: "b.example" },
    ]);
  });
});

describe("extractRecalledSources", () => {
  it("parses a trailing sources block and strips it from the notes", () => {
    const text =
      '- Fact one.\n\n**Sources:**\n```sources\n[{"title": "WHO report", "url": "https://who.int/r"}, {"title": "", "url": "https://www.nih.gov/a"}]\n```\n';
    expect(extractRecalledSources(text)).toEqual({
      notes: "- Fact one.",
      sources: [
        { url: "https://who.int/r", title: "WHO report" },
        { url: "https://www.nih.gov/a", title: "nih.gov" },
      ],
    });
  });

  it("accepts a json-tagged block, an object wrapper and caps at three sources", () => {
    const list = [1, 2, 3, 4].map((n) => ({ title: `T${n}`, url: `https://s${n}.example` }));
    const text = `Notes.\n\n\`\`\`json\n${JSON.stringify({ sources: list })}\n\`\`\``;
    const { notes, sources } = extractRecalledSources(text);
    expect(notes).toBe("Notes.");
    expect(sources.map((source) => source.title)).toEqual(["T1", "T2", "T3"]);
  });

  it("drops invalid entries and non-http URLs", () => {
    const text =
      'N\n```sources\n[{"url": "ftp://x.example"}, {"title": "no url"}, "str", {"url": "https://ok.example", "title": 5}]\n```';
    expect(extractRecalledSources(text).sources).toEqual([
      { url: "https://ok.example", title: "ok.example" },
    ]);
  });

  it("keeps the text and yields no sources for a malformed or truncated block", () => {
    expect(extractRecalledSources('Notes.\n```sources\n[{"title": \n```')).toEqual({
      notes: "Notes.",
      sources: [],
    });
    expect(extractRecalledSources('Notes.\n```sources\n[{"title": "cut off')).toEqual({
      notes: "Notes.",
      sources: [],
    });
  });

  it("accepts a bare trailing JSON array", () => {
    expect(extractRecalledSources('Notes.\n[{"title": "A", "url": "https://a.example"}]')).toEqual({
      notes: "Notes.",
      sources: [{ url: "https://a.example", title: "A" }],
    });
  });

  it("leaves text without a block untouched, including earlier code blocks", () => {
    const text = "Intro\n```\ncode\n```\nMore notes.";
    expect(extractRecalledSources(text)).toEqual({ notes: text, sources: [] });
    const withBoth =
      'Intro\n```\ncode\n```\nMore.\n```sources\n[{"url": "https://a.example"}]\n```';
    expect(extractRecalledSources(withBoth)).toEqual({
      notes: "Intro\n```\ncode\n```\nMore.",
      sources: [{ url: "https://a.example", title: "a.example" }],
    });
  });
});

describe("source catalog and citations", () => {
  const catalog = buildSourceCatalog([
    {
      grounded: false,
      sources: [
        { url: "https://a.example/1", title: "A one" },
        { url: "https://b.example/", title: "" },
      ],
    },
    {
      grounded: true,
      sources: [
        { url: "https://A.example/1#frag", title: "A again" },
        { url: "https://c.example/3", title: "C" },
      ],
    },
  ]);

  it("numbers de-duplicated sources and records which ids each finding used", () => {
    expect(catalog.idsByFinding).toEqual([
      [1, 2],
      [1, 3],
    ]);
    expect(catalog.sources).toEqual<ResearchSource[]>([
      { id: 1, url: "https://a.example/1", title: "A one", domain: "a.example", grounded: true },
      {
        id: 2,
        url: "https://b.example/",
        title: "b.example",
        domain: "b.example",
        grounded: false,
      },
      { id: 3, url: "https://c.example/3", title: "C", domain: "c.example", grounded: true },
    ]);
    expect(formatSourceList(catalog.sources)).toBe(
      "[1] A one — a.example\n[2] b.example\n[3] C — c.example"
    );
  });

  it("keeps only cited sources, renumbered in order of first citation", () => {
    const report =
      "Intro [3]. Ranges [1-2]. Mixed [3, 7] and [8]. Link [2](https://x) and ref\n\n[1]: note";
    const result = finalizeCitations(report, catalog.sources);
    expect(result.report).toBe(
      "Intro [1]. Ranges [2][3]. Mixed [1] and. Link [2](https://x) and ref\n\n[1]: note"
    );
    expect(result.sources.map(({ id, url }) => ({ id, url }))).toEqual([
      { id: 1, url: "https://c.example/3" },
      { id: 2, url: "https://a.example/1" },
      { id: 3, url: "https://b.example/" },
    ]);
  });

  it("returns no sources when nothing is cited", () => {
    expect(finalizeCitations("No citations here [2024].", catalog.sources)).toEqual({
      report: "No citations here [2024].",
      sources: [],
    });
    expect(finalizeCitations("Claim [1].", [])).toEqual({ report: "Claim.", sources: [] });
  });
});
