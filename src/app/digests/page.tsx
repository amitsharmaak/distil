import { DigestExperience } from "@/components/phase2/digest-experience";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";
import { notFound } from "next/navigation";

export default function DigestsPage() {
  if (!readPhase2FeatureFlags().digests) notFound();

  return <DigestExperience />;
}
