import { Share2 } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { CaptureForm } from "@/components/capture/capture-form";

export const metadata = { title: "Save an article — Distil" };

export default function SavePage() {
  return (
    <PageContainer size="reading" className="space-y-8">
      <PageHeader
        title="Save an article"
        description="Paste a link and Distil will extract, summarize, and organize it for your feed."
      />
      <section className="border-y border-border py-6" aria-label="Article capture form">
        <CaptureForm />
      </section>
      <aside className="flex gap-3 rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
        <Share2 className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          On iPhone, use the Distil Shortcut from Chrome or any app with a Share button to save
          without copying the link.
        </p>
      </aside>
    </PageContainer>
  );
}
