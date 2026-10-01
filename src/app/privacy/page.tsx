import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy · Distil",
  description: "What Distil and the Distil browser extension collect, and why.",
};

/**
 * Public path: the Chrome Web Store listing links here and reviewers read it without an account.
 * Static content only; keep it in step with what browser-extension/background.js actually sends.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-serif text-3xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated 1 October 2026</p>

      <div className="mt-8 space-y-8 text-[15px] leading-7">
        <section aria-labelledby="overview">
          <h2 id="overview" className="font-serif text-xl font-semibold">
            Overview
          </h2>
          <p className="mt-2">
            Distil is an invitation-only reading and knowledge service. You save pages and notes to
            your Distil account, and Distil summarises and organises them for you. This page
            explains what Distil and the Distil browser extension collect and how that data is used.
          </p>
        </section>

        <section aria-labelledby="extension">
          <h2 id="extension" className="font-serif text-xl font-semibold">
            The browser extension
          </h2>
          <p className="mt-2">
            The extension only sends data when you save something, by clicking the toolbar button,
            using the keyboard shortcut or choosing &ldquo;Save to Distil&rdquo; from the context
            menu. When you save, it sends to your Distil account:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>the address (URL) of the page or link you saved,</li>
            <li>the page title,</li>
            <li>any text you had selected, saved as a note.</li>
          </ul>
          <p className="mt-2">
            It does not read your browsing history, does not run on pages you have not saved, and
            contains no analytics or advertising code. On your device it keeps the sign-in token for
            your Distil account, the name of the connected browser, and a queue of saves that could
            not be delivered yet (for example while you are offline). Disconnecting the browser in
            Distil&rsquo;s Settings stops it from saving until you sign in again.
          </p>
        </section>

        <section aria-labelledby="service">
          <h2 id="service" className="font-serif text-xl font-semibold">
            What Distil does with saved items
          </h2>
          <p className="mt-2">
            For each item you save, Distil fetches the page&rsquo;s public content and uses
            third-party AI model providers (such as Anthropic, Google and OpenAI) to produce
            summaries and organise your library. Content is sent to these providers only to perform
            that processing. Your account, saved items and summaries are stored in Distil&rsquo;s
            database and file storage, hosted with our infrastructure providers (Vercel and Neon).
          </p>
          <p className="mt-2">
            Distil does not sell your data, does not use it for advertising, and does not share it
            with anyone except the providers above, which process it on Distil&rsquo;s behalf.
          </p>
        </section>

        <section aria-labelledby="choices">
          <h2 id="choices" className="font-serif text-xl font-semibold">
            Your choices
          </h2>
          <p className="mt-2">
            You can disconnect any browser from Settings at any time. From your Account page you can
            export your data and delete your account; deleting your account removes your saved items
            and summaries.
          </p>
        </section>

        <section aria-labelledby="contact">
          <h2 id="contact" className="font-serif text-xl font-semibold">
            Contact
          </h2>
          <p className="mt-2">
            Questions about this policy can be sent to the contact address shown on the Distil
            listing in the Chrome Web Store.
          </p>
        </section>
      </div>
    </main>
  );
}
