/**
 * Today's Brief — the home screen of Distil.
 *
 * Redesigned as an editorial "morning brief" that reads like a newsletter:
 * greeting + inline stats → priority reading → recent activity.
 *
 * Server Component — fetches directly from the database.
 */

export const dynamic = "force-dynamic";
import { TodayExperience } from "@/components/phase2/today-experience";

export default async function TodayPage() {
  return <TodayExperience />;
}
