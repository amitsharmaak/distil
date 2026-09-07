"use client";

import { Suspense } from "react";
import { SearchExperience } from "@/components/phase2/search-experience";

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="py-12 text-center text-muted-foreground">Loading search…</p>}>
      <SearchExperience />
    </Suspense>
  );
}
