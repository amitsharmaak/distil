import { ArchiveExperience } from "@/components/phase2/library-experiences";
import { notFound } from "next/navigation";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";

export default function ArchivePage() {
  if (!readPhase2FeatureFlags().knowledgeUi) notFound();

  return <ArchiveExperience />;
}
