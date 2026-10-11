import type { Metadata } from "next";
import LoginForm from "@/components/crm/LoginForm";
import Link from "next/link";
import { getCurrentUser } from "@/lib/crm/data";
import { redirect } from "next/navigation";

// Unlinked break-glass page: PIN is the normal way in, but the account still
// has a password, so an admin who is locked out of every PIN can still reach
// the CRM here. Nothing in the UI links to it.
export const metadata: Metadata = {
  title: "CRM Login (password) | Patang Future Homes",
  robots: { index: false, follow: false },
};

export default async function PasswordLoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/crm/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-primary">Sign in with password</h1>
          <p className="mt-1 text-sm text-muted">
            Backup login. PIN is the normal way in.
          </p>
        </div>
        <LoginForm />
        <div className="mt-4 text-center">
          <Link href="/crm/login" className="text-xs font-semibold text-primary underline">
            Use PIN instead
          </Link>
        </div>
      </div>
    </div>
  );
}
