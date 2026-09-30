import {
  displayTitle,
  domainOf,
  hasNumberedSources,
  isGroundingRedirect,
  titleFromUrl,
  normalizeSources,
  shortPath,
  splitSources,
  urlKey,
  urlsInMarkdown,
} from "@/components/research/research-sources";

describe("normalizeSources", () => {
  it("accepts the legacy string[] shape", () => {
    expect(
      normalizeSources(["https://www.Example.com/a", " https://b.example.org/ ", "not a url"])
    ).toEqual([
      {
        id: 1,
        url: "https://www.Example.com/a",
        title: null,
        domain: "example.com",
        grounded: false,
      },
      {
        id: 2,
        url: "https://b.example.org/",
        title: null,
        domain: "b.example.org",
        grounded: false,
      },
    ]);
  });

  it("accepts R2 source objects and fills missing fields", () => {
    expect(
      normalizeSources([
        {
          id: 3,
          url: "https://a.example/x",
          title: "A page",
          domain: "a.example",
          grounded: true,
        },
        { url: "https://www.b.example/y", title: "  " },
        { id: 9, url: "javascript:alert(1)", title: "bad" },
        null,
      ])
    ).toEqual([
      { id: 3, url: "https://a.example/x", title: "A page", domain: "a.example", grounded: true },
      { id: 2, url: "https://www.b.example/y", title: null, domain: "b.example", grounded: false },
    ]);
  });

  it("parses a JSON string and rejects other shapes", () => {
    expect(normalizeSources('["https://a.example"]')).toHaveLength(1);
    expect(normalizeSources("{not json")).toEqual([]);
    expect(normalizeSources({ url: "https://a.example" })).toEqual([]);
    expect(normalizeSources(undefined)).toEqual([]);
  });

  it("drops repeated URLs", () => {
    expect(
      normalizeSources([
        "https://a.example/x",
        "https://www.a.example/x/",
        "https://a.example/x#top",
      ])
    ).toHaveLength(1);
  });
});

describe("display helpers", () => {
  it("derives domains and short paths", () => {
    expect(domainOf("https://www.nature.com/")).toBe("nature.com");
    expect(domainOf("nope")).toBe("nope");
    expect(shortPath("https://nature.com/")).toBe("");
    expect(shortPath("https://x.example/a/b%20c/d/e")).toBe("/a/b c/…");
    expect(shortPath("https://x.example/" + "long-segment-".repeat(6))).toHaveLength(40);
  });

  it("builds comparable URL keys", () => {
    expect(urlKey("https://WWW.Example.com/a/")).toBe(urlKey("https://example.com/a"));
    expect(urlKey("https://example.com/a.")).toBe(urlKey("https://example.com/a"));
    expect(urlKey("https://example.com/a?q=1")).not.toBe(urlKey("https://example.com/a"));
  });

  it("finds markdown and bare URLs in order of appearance", () => {
    expect(
      urlsInMarkdown(
        'See https://b.example/2. Then [a](https://a.example/1 "distil:cite") and [again](https://b.example/2).'
      )
    ).toEqual(["https://b.example/2", "https://a.example/1"]);
  });
});

describe("splitSources", () => {
  it("splits legacy sources into cited (in text order) and other", () => {
    const sources = normalizeSources([
      "https://ieeexplore.ieee.org/",
      "https://www.example.com/cited-second",
      "https://cited.example/first",
      "https://unrelated.example/page",
    ]);
    const report =
      "Point ([First](https://cited.example/first)). Another [x](https://example.com/cited-second/).";
    const { cited, other } = splitSources(sources, report);
    expect(cited.map((source) => source.url)).toEqual([
      "https://cited.example/first",
      "https://www.example.com/cited-second",
    ]);
    expect(other.map((source) => source.url)).toEqual([
      "https://ieeexplore.ieee.org/",
      "https://unrelated.example/page",
    ]);
  });

  it("counts links in the text that are missing from the stored list as cited", () => {
    const { cited, other } = splitSources(
      normalizeSources(["https://a.example"]),
      "Only [b](https://b.example/x)."
    );
    expect(cited).toEqual([
      { id: 2, url: "https://b.example/x", title: null, domain: "b.example", grounded: false },
    ]);
    expect(other.map((source) => source.url)).toEqual(["https://a.example"]);
  });

  it("treats numbered sources as cited when their [n] marker appears", () => {
    const sources = normalizeSources([
      { id: 1, url: "https://a.example", title: "A", domain: "a.example", grounded: true },
      { id: 2, url: "https://b.example", title: "B", domain: "b.example", grounded: true },
    ]);
    const { cited, other } = splitSources(
      sources,
      "Claim [2]. A link [1](https://elsewhere.example)."
    );
    expect(cited.map((source) => source.id)).toEqual([3, 2]);
    expect(cited[0].url).toBe("https://elsewhere.example");
    expect(other.map((source) => source.id)).toEqual([1]);
  });

  it("returns everything as other when the report links nothing", () => {
    const sources = normalizeSources(["https://a.example", "https://b.example"]);
    expect(splitSources(sources, "No links.")).toEqual({ cited: [], other: sources });
  });
});

describe("display titles and unresolved redirects", () => {
  const redirect = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQabc123";

  it("derives a readable title from the URL when grounding titled the page with its domain", () => {
    const [apple, android, arxiv, kept] = normalizeSources([
      {
        id: 1,
        url: "https://machinelearning.apple.com/research/introducing-third-generation-foundation-models",
        title: "apple.com",
        domain: "machinelearning.apple.com",
        grounded: true,
      },
      {
        id: 2,
        url: "https://developer.android.com/ai/gemini_nano.html",
        title: "android.com",
        domain: "developer.android.com",
        grounded: true,
      },
      { id: 3, url: "https://arxiv.org/abs/2601.01234", title: "arxiv.org", grounded: true },
      { id: 4, url: "https://a.example/x-y", title: "A real title", grounded: true },
    ]);
    expect(apple.title).toBe("Introducing third generation foundation models");
    expect(android.title).toBe("Gemini nano");
    expect(arxiv.title).toBeNull();
    expect(arxiv.domain).toBe("arxiv.org");
    expect(kept.title).toBe("A real title");
  });

  it("trims long derived titles at a word boundary and skips generic or opaque segments", () => {
    const long = `https://a.example/news/${"very-long-words-".repeat(10)}end/index.html`;
    const title = titleFromUrl(long)!;
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith("…")).toBe(true);
    expect(title.startsWith("Very long words")).toBe(true);
    expect(titleFromUrl("https://a.example/news/")).toBeNull();
    expect(titleFromUrl("https://a.example/p/AbC123xyz")).toBeNull();
    expect(titleFromUrl(redirect)).toBeNull();
    expect(displayTitle("apple.com", "https://apple.com/")).toBeNull();
  });

  it("shows an unresolved redirect as its grounding domain, with no path", () => {
    const [stored, bare] = normalizeSources([
      { id: 1, url: redirect, title: "biggo.com", domain: "biggo.com", grounded: true },
      { id: 2, url: `${redirect}2`, title: "www.Example.org", grounded: true },
    ]);
    expect(stored).toMatchObject({ title: null, domain: "biggo.com" });
    expect(bare).toMatchObject({ title: null, domain: "example.org" });
    expect(shortPath(redirect)).toBe("");
    expect(isGroundingRedirect(redirect)).toBe(true);
    expect(isGroundingRedirect("https://biggo.com/grounding-api-redirect/x")).toBe(false);
  });

  it("leaves legacy string sources untitled", () => {
    expect(normalizeSources(["https://a.example/some-article"])[0].title).toBeNull();
  });
});

describe("hasNumberedSources", () => {
  it("recognises R2 source objects, raw or as JSON", () => {
    const objects = [{ id: 1, url: "https://a.example", title: "A", domain: "a.example" }];
    expect(hasNumberedSources(objects)).toBe(true);
    expect(hasNumberedSources(JSON.stringify(objects))).toBe(true);
  });

  it("treats legacy URL lists, empty lists and garbage as not numbered", () => {
    expect(hasNumberedSources(["https://a.example"])).toBe(false);
    expect(hasNumberedSources([])).toBe(false);
    expect(hasNumberedSources("[]")).toBe(false);
    expect(hasNumberedSources("not json")).toBe(false);
    expect(hasNumberedSources(null)).toBe(false);
    expect(hasNumberedSources([{ url: "https://a.example" }, "https://b.example"])).toBe(false);
  });
});
