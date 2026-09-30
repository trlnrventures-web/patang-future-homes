import type { Metadata } from "next";
import Link from "next/link";
import ResetPasswordForm from "@/components/crm/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Set a New Password | Patang Future Homes",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token } = await searchParams;
  const tokenValue = typeof token === "string" ? token : "";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
              <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
            </svg>
          </div>
          <h1 className="mt-4 text-xl font-bold text-primary">Set a new password</h1>
        </div>

        {tokenValue ? (
          <>
            <ResetPasswordForm token={tokenValue} />
            <p className="mt-4 text-center text-xs text-muted">
              This link works once and expires 30 minutes after it was sent.
            </p>
          </>
        ) : (
          <div className="rounded-xl border border-border bg-white p-4 text-sm text-muted">
            <p className="font-semibold text-navy">This link is incomplete</p>
            <p className="mt-1">
              Open the link from your reset email exactly as it was sent.
            </p>
            <Link
              href="/crm/forgot-password"
              className="mt-4 inline-block text-sm font-semibold text-primary underline"
            >
              Request a new link
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
