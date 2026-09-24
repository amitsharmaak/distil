import { isWisprUrl, parseWisprNote, renderWisprMarkdown, wisprShareSlug } from "../wispr";

const body = JSON.stringify({
  meeting_id: "4fe07db4",
  title: "Pilot Deployment Planning",
  notes: null,
  summary: "### Geography\n- UAE with Hussain on board.",
  created_at: "2026-09-24T06:59:24.049000",
  owner: { email: null, role: "owner", profile: { first_name: "Abhinn", last_name: "Kothari" } },
});

it("recognises shared note URLs only", () => {
  expect(isWisprUrl("https://notes.wisprflow.ai/shared/NdNXPj7C-_bj?utm_source=x")).toBe(true);
  expect(wisprShareSlug("https://notes.wisprflow.ai/shared/NdNXPj7C-_bj")).toBe("NdNXPj7C-_bj");
  // `/<slug>` resolves in the app but collides with its own routes, and the
  // share button never produces it.
  expect(isWisprUrl("https://notes.wisprflow.ai/NdNXPj7C-_bj")).toBe(false);
  expect(isWisprUrl("https://notes.wisprflow.ai/shared/")).toBe(false);
  expect(isWisprUrl("https://wisprflow.ai/shared/NdNXPj7C-_bj")).toBe(false);
  expect(isWisprUrl("not a url")).toBe(false);
});

it("reads the note, title, owner and date from the share API response", () => {
  expect(parseWisprNote(body)).toEqual({
    title: "Pilot Deployment Planning",
    owner: "Abhinn Kothari",
    createdAt: "2026-09-24T06:59:24.049000",
    markdown: "### Geography\n- UAE with Hussain on board.",
  });
});

it("falls back to the raw notes when no summary has been generated", () => {
  const raw = JSON.stringify({ title: "Standup", summary: null, notes: "Shipped the worker." });
  expect(parseWisprNote(raw)).toMatchObject({ markdown: "Shipped the worker.", owner: null });
});

it("returns null for a response carrying no note", () => {
  expect(parseWisprNote("not json")).toBeNull();
  expect(parseWisprNote(JSON.stringify({ title: "Empty", summary: "  ", notes: null }))).toBeNull();
});

it("names the note when the API omits a title", () => {
  expect(parseWisprNote(JSON.stringify({ summary: "Body." }))).toMatchObject({
    title: "Meeting notes",
  });
});

it("renders headings, nested lists and paragraphs to reader HTML and text", () => {
  const rendered = renderWisprMarkdown(
    [
      "Product sync: **DistilAI** is deployed.",
      "",
      "### Deployment & <Tooling>",
      "- Live at [the app](https://distilai.app) on Vercel.",
      "    - Decision trees return in ~0.2s.",
      "- Uses Gemini for most tasks.",
      "",
      "1. Onboard the second user.",
    ].join("\n")
  );
  expect(rendered.html).toBe(
    [
      "<p>Product sync: <strong>DistilAI</strong> is deployed.</p>",
      "<h2>Deployment &amp; &lt;Tooling&gt;</h2>",
      "<ul>",
      '<li>Live at <a href="https://distilai.app">the app</a> on Vercel.</li>',
      "<ul>",
      "<li>Decision trees return in ~0.2s.</li>",
      "</ul>",
      "<li>Uses Gemini for most tasks.</li>",
      "</ul>",
      "<ol>",
      "<li>Onboard the second user.</li>",
      "</ol>",
    ].join("\n")
  );
  expect(rendered.text).toBe(
    [
      "Product sync: DistilAI is deployed.",
      "Deployment & <Tooling>",
      "- Live at the app on Vercel.",
      "  - Decision trees return in ~0.2s.",
      "- Uses Gemini for most tasks.",
      "- Onboard the second user.",
    ].join("\n\n")
  );
});

it("nests headings below the note's shallowest level", () => {
  // Wispr's own sections are `###`; they should still open at h2.
  expect(renderWisprMarkdown("### Section\n#### Detail\n##### Deeper").html).toBe(
    ["<h2>Section</h2>", "<h3>Detail</h3>", "<h4>Deeper</h4>"].join("\n")
  );
  expect(renderWisprMarkdown("# Top\n## Sub").html).toBe(
    ["<h2>Top</h2>", "<h3>Sub</h3>"].join("\n")
  );
});

it("escapes markup in the note before inline markdown is applied", () => {
  const rendered = renderWisprMarkdown('<script>alert("x")</script> and `a < b`');
  expect(rendered.html).toBe(
    "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; and <code>a &lt; b</code></p>"
  );
});

it("ignores a link whose target is not http(s)", () => {
  const rendered = renderWisprMarkdown("See [this](javascript:alert(1)) now.");
  expect(rendered.html).not.toContain("<a ");
  expect(rendered.html).toContain("javascript:alert(1)");
});
