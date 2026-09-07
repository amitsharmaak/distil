import { CollectionDetailExperience } from "@/components/phase2/library-experiences";

export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  return <CollectionDetailExperience collectionId={(await params).id} />;
}
