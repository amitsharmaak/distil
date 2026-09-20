import { isGranolaUrl, parseGranolaPage, renderProseMirror } from "../granola";

const doc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Timeline" }] },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Launch ", marks: [{ type: "bold" }] },
                { type: "text", text: "Oct 15 <soon>" },
              ],
            },
            {
              type: "bulletList",
              content: [
                {
                  type: "listItem",
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        {
                          type: "text",
                          text: "docs",
                          marks: [{ type: "link", attrs: { href: "https://d.example/" } }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    { type: "horizontalRule" },
    { type: "paragraph", content: [{ type: "text", text: "Next steps." }] },
  ],
};

function page(): string {
  const payload = JSON.stringify([
    "$",
    "$L28",
    null,
    {
      documentPanel: {
        document: {
          id: "c6ad",
          title: "Dan <> Play Catch Up",
          created_at: "2026-09-17T08:32:23.135Z",
          owner: { name: "Sumit Pandey" },
        },
        panel: { title: "Summary", content: doc },
      },
    },
  ]);
  const chunk = JSON.stringify(payload).slice(1, -1);
  return `<html><head><meta property="og:title" content="Dan &lt;&gt; Play Catch Up"/></head><body><script>self.__next_f.push([1,"${chunk}"])</script></body></html>`;
}

it("recognises shared note URLs only", () => {
  expect(isGranolaUrl("https://notes.granola.ai/d/c6ad?utm_source=x")).toBe(true);
  expect(isGranolaUrl("https://notes.granola.ai/")).toBe(false);
  expect(isGranolaUrl("https://granola.ai/d/c6ad")).toBe(false);
});

it("reads the note, title, owner and date from the page payload", () => {
  const note = parseGranolaPage(page());
  expect(note).toMatchObject({
    title: "Dan <> Play Catch Up",
    owner: "Sumit Pandey",
    createdAt: "2026-09-17T08:32:23.135Z",
  });
  expect(note?.doc.content).toHaveLength(4);
  expect(parseGranolaPage("<html></html>")).toBeNull();
});

it("renders the ProseMirror document to reader HTML and text", () => {
  const rendered = renderProseMirror(doc);
  expect(rendered.html).toBe(
    [
      "<h2>Timeline</h2>",
      "<ul>",
      "<li>",
      "<strong>Launch </strong>Oct 15 &lt;soon&gt;",
      "<ul>",
      "<li>",
      '<a href="https://d.example/">docs</a>',
      "</li>",
      "</ul>",
      "</li>",
      "</ul>",
      "<hr>",
      "<p>Next steps.</p>",
    ].join("\n")
  );
  expect(rendered.text).toBe("Timeline\n\n- Launch Oct 15 <soon>\n\n  - docs\n\nNext steps.");
});
