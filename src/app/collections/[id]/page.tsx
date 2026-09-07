import { CollectionDetailExperience } from "@/components/phase2/library-experiences";
import { notFound } from "next/navigation";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";

export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  if (!readPhase2FeatureFlags().knowledgeUi) notFound();

  return <CollectionDetailExperience collectionId={(await params).id} />;
}
