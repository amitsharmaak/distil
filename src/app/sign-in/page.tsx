import { PageContainer } from "@/components/ui/page-header";
import { SignInCard } from "@/components/auth/sign-in-card";

export default function SignInPage() {
  return (
    <PageContainer
      size="reading"
      className="flex min-h-screen flex-col justify-center gap-6 px-6 py-10"
    >
      <meta content="no-referrer" name="referrer" />
      <SignInCard />
    </PageContainer>
  );
}
