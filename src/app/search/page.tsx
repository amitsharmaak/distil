import { Suspense } from "react";
import { notFound } from "next/navigation";
import { SearchExperience } from "@/components/phase2/search-experience";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";

export default function SearchPage() {
  if (!readPhase2FeatureFlags().search) notFound();

  return (
    <Suspense fallback={<p className="py-12 text-center text-muted-foreground">Loading search…</p>}>
      <SearchExperience />
    </Suspense>
  );
}
