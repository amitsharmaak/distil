import { PageContainer } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the Research page: header with actions, the ruled prompt section, ruled report rows. */
export default function ResearchLoading() {
  return (
    <PageContainer className="space-y-8" role="status" aria-label="Loading research">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1 basis-60 space-y-3">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-11 w-24 rounded-md" />
          <Skeleton className="h-11 w-36 rounded-md" />
        </div>
      </header>
      <section className="space-y-3 border-y border-border py-6">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-96 max-w-full" />
        <Skeleton className="h-11 w-40 rounded-md" />
      </section>
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <div className="divide-y border-y border-border">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-start justify-between gap-4 py-5">
              <div className="min-w-0 flex-1 space-y-3">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-6 w-24 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Loading research…</span>
    </PageContainer>
  );
}
