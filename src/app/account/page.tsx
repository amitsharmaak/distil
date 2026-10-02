import { PageHeader, PageContainer } from "@/components/ui/page-header";
import { AccountCenter } from "@/components/account/account-center";

export default function AccountPage() {
  return (
    <PageContainer size="reading" className="space-y-6 py-8">
      <PageHeader
        title="Account"
        description={<>Manage your profile, privacy, devices, capture tokens, and data.</>}
      />
      <AccountCenter />
    </PageContainer>
  );
}
