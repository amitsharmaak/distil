import { PageHeader, PageContainer } from "@/components/ui/page-header";
import { AccountCenter } from "@/components/account/account-center";

export default function OnboardingPage() {
  return (
    <PageContainer
      size="reading"
      className="flex min-h-screen flex-col justify-center gap-6 px-6 py-10"
    >
      <PageHeader
        title="Welcome to Distil"
        description={<>A few details make your first daily brief feel like it belongs to you.</>}
      />
      <AccountCenter onboarding />
    </PageContainer>
  );
}
