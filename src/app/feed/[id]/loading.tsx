import { PageContainer } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the reader: wide container, one reading column, header, view tabs, then text. */
export default function ReaderLoading() {
  return (
    <PageContainer size="wide" role="status" aria-label="Loading article">
      <div className="distil-reader-page pb-24">
        <div className="distil-reader-column mx-auto">
          <header className="mb-5">
            {/* Publisher and area on the left, the display-settings control on the right. */}
            <div className="mb-2 flex min-h-11 items-center justify-between gap-2">
              <Skeleton className="h-4 w-40 max-w-[60%]" />
              <Skeleton className="size-11 rounded-md" />
            </div>
            <div className="space-y-3">
              <Skeleton className="h-9 w-full sm:h-11" />
              <Skeleton className="h-9 w-3/5 sm:h-11" />
            </div>
            <Skeleton className="mt-4 h-4 w-56 max-w-full" />
          </header>
          {/* Summary / Original tabs and the summary length control. */}
          <div className="mb-4 flex h-11 items-center justify-between gap-2 border-b">
            <div className="flex items-center gap-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-11/12" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        </div>
      </div>
      <span className="sr-only">Loading article…</span>
    </PageContainer>
  );
}
