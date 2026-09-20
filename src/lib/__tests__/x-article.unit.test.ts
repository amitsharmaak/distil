import { renderXArticle } from "../x-article";

const article = {
  title: "WTF Is Jev?",
  content: {
    blocks: [
      { key: "a", type: "header-two", text: "Intro", inlineStyleRanges: [], entityRanges: [] },
      {
        key: "b",
        type: "unstyled",
        text: "Read the docs & <try> it",
        inlineStyleRanges: [{ offset: 0, length: 4, style: "Bold" }],
        entityRanges: [{ offset: 9, length: 4, key: 1 }],
      },
      {
        key: "c",
        type: "unordered-list-item",
        text: "one",
        inlineStyleRanges: [],
        entityRanges: [],
      },
      {
        key: "d",
        type: "unordered-list-item",
        text: "two",
        inlineStyleRanges: [],
        entityRanges: [],
      },
      {
        key: "e",
        type: "atomic",
        text: " ",
        inlineStyleRanges: [],
        entityRanges: [{ offset: 0, length: 1, key: 0 }],
      },
      {
        key: "f",
        type: "atomic",
        text: " ",
        inlineStyleRanges: [],
        entityRanges: [{ offset: 0, length: 1, key: 2 }],
      },
      { key: "g", type: "blockquote", text: "quoted", inlineStyleRanges: [], entityRanges: [] },
      { key: "h", type: "unstyled", text: "   ", inlineStyleRanges: [], entityRanges: [] },
    ],
    entityMap: [
      { key: "0", value: { type: "TWEET", data: { tweetId: "123" } } },
      { key: "1", value: { type: "LINK", data: { url: "https://docs.example.com/x" } } },
      {
        key: "2",
        value: { type: "MARKDOWN", data: { markdown: "```python\nprint('<hi>')\n```" } },
      },
      { key: "3", value: { type: "LINK", data: { url: "javascript:alert(1)" } } },
    ],
  },
  media_entities: [],
};

it("renders Draft.js blocks into reader HTML, text and links", () => {
  const rendered = renderXArticle(article);
  expect(rendered).toBeDefined();
  expect(rendered?.html).toBe(
    [
      "<h2>Intro</h2>",
      '<p><strong>Read</strong> the <a href="https://docs.example.com/x">docs</a> &amp; &lt;try&gt; it</p>',
      "<ul>",
      "<li>one</li>",
      "<li>two</li>",
      "</ul>",
      '<blockquote><p>Embedded post: <a href="https://x.com/i/status/123">https://x.com/i/status/123</a></p></blockquote>',
      "<pre><code class=\"language-python\">print('&lt;hi&gt;')</code></pre>",
      "<blockquote>quoted</blockquote>",
    ].join("\n")
  );
  expect(rendered?.text).toBe(
    "Intro\n\nRead the docs & <try> it\n\n- one\n\n- two\n\nEmbedded post: https://x.com/i/status/123\n\nprint('<hi>')\n\nquoted"
  );
  expect(rendered?.links).toEqual([{ text: "docs", url: "https://docs.example.com/x" }]);
});

it("keeps nesting valid when a link and a style overlap", () => {
  const rendered = renderXArticle({
    content: {
      blocks: [
        {
          type: "unstyled",
          text: "abcdef",
          inlineStyleRanges: [{ offset: 0, length: 4, style: "Bold" }],
          entityRanges: [{ offset: 2, length: 4, key: 0 }],
        },
      ],
      entityMap: [{ key: "0", value: { type: "LINK", data: { url: "https://e.com/" } } }],
    },
  });
  expect(rendered?.html).toBe(
    '<p><strong>ab<a href="https://e.com/">cd</a></strong><a href="https://e.com/">ef</a></p>'
  );
});

it("returns undefined for an article without text", () => {
  expect(renderXArticle({ content: { blocks: [] } })).toBeUndefined();
});
