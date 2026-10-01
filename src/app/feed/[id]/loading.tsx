import { Skeleton } from "@/components/ui/skeleton";

export default function ReaderLoading() {
  return (
    <div
      className="distil-reader-page mx-auto max-w-2xl space-y-5 pb-20"
      role="status"
      aria-label="Loading article"
    >
      <div className="mt-2 flex items-center gap-2">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="ml-auto h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-8 w-4/5" />
      <Skeleton className="h-4 w-2/5" />
      <div className="space-y-3 border-t pt-6">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <span className="sr-only">Loading article…</span>
    </div>
  );
}
