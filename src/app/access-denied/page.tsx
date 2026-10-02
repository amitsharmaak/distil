import { DistilLogo } from "@/components/brand/distil-logo";
import { PageHeader, PageContainer } from "@/components/ui/page-header";
import Link from "next/link";

export default function AccessDeniedPage() {
  return (
    <PageContainer
      size="reading"
      className="flex min-h-screen flex-col justify-center gap-6 px-6 py-10"
    >
      <DistilLogo className="h-10 w-auto self-start text-foreground" />
      <PageHeader
        title="Unable to continue"
        description={
          <>
            This signed-in identity does not have access to an active Distil account. Ask the
            operator who invited you to issue a new invitation, then use the same verified email
            address.
          </>
        }
      />
      <Link className="text-sm underline" href="/sign-in">
        Go to sign-in
      </Link>
    </PageContainer>
  );
}
