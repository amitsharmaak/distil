import { AskExperience } from "@/components/phase2/ask-experience";
import { notFound } from "next/navigation";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";

export default function AskPage() {
  if (!readPhase2FeatureFlags().answers) notFound();

  return <AskExperience />;
}
