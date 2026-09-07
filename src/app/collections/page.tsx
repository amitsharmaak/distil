import { CollectionsExperience } from "@/components/phase2/library-experiences";
import { notFound } from "next/navigation";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";

export default function CollectionsPage() {
  if (!readPhase2FeatureFlags().knowledgeUi) notFound();

  return <CollectionsExperience />;
}
