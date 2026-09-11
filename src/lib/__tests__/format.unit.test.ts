import { toPlainText } from "../format";

describe("toPlainText", () => {
  it("returns an empty string for missing values", () => {
    expect(toPlainText(undefined)).toBe("");
    expect(toPlainText(null)).toBe("");
    expect(toPlainText("   ")).toBe("");
  });

  it("strips reader HTML tags without gluing block boundaries together", () => {
    expect(toPlainText("<p>First para</p><p>Second para</p>")).toBe("First para Second para");
    expect(toPlainText('<a href="https://example.test">Link</a> text')).toBe("Link text");
    expect(toPlainText("<script>alert(1)</script>Body")).toBe("Body");
    expect(toPlainText("<!-- note -->Body")).toBe("Body");
  });

  it("drops a tag left unterminated by excerpt truncation", () => {
    expect(toPlainText('Durable queues persist work.<div class="foot')).toBe(
      "Durable queues persist work."
    );
    expect(toPlainText("Body<script>alert(")).toBe("Body");
  });

  it("decodes named and numeric entities after tags are removed", () => {
    expect(toPlainText("Ben &amp; Jerry&#39;s")).toBe("Ben & Jerry's");
    expect(toPlainText("a&nbsp;b &hellip; &#x2014;")).toBe("a b … —");
    expect(toPlainText("&lt;p&gt;not a tag&lt;/p&gt;")).toBe("<p>not a tag</p>");
    expect(toPlainText("&notanentity; stays")).toBe("&notanentity; stays");
    expect(toPlainText("&#0; &#1114112; &#x110000;")).toBe("&#0; &#1114112; &#x110000;");
  });

  it("removes Markdown heading, emphasis, link and list syntax", () => {
    expect(toPlainText("## Heading\n\nBody")).toBe("Heading Body");
    expect(toPlainText("**bold** and *italic* and __also__ and ~~gone~~")).toBe(
      "bold and italic and also and gone"
    );
    expect(toPlainText("See [the docs](https://example.test/docs) now")).toBe("See the docs now");
    expect(toPlainText("![alt text](https://example.test/i.png)")).toBe("alt text");
    expect(toPlainText("- one\n* two\n+ three\n1. four\n2) five")).toBe("one two three four five");
    expect(toPlainText("> quoted line")).toBe("quoted line");
    expect(toPlainText("---")).toBe("");
    expect(toPlainText("```ts\nconst a = 1;\n```")).toBe("const a = 1;");
    expect(toPlainText("use `npm test` today")).toBe("use npm test today");
  });

  it("collapses whitespace across mixed Markdown and HTML", () => {
    expect(toPlainText("## Why\n\n<p>**It**   matters &amp; more</p>\n\n")).toBe(
      "Why It matters & more"
    );
  });
});
