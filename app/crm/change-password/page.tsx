import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/crm/data";
import ChangePasswordForm from "@/components/crm/ChangePasswordForm";

export const metadata: Metadata = {
  title: { absolute: "Set New Password | Patang CRM" },
  robots: { index: false, follow: false },
};

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center">
      <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-primary">Set a New Password</h1>
        {user.mustChangePassword ? (
          <p className="mt-1 text-sm text-muted">
            Set your new password first. You will not be able to use the CRM
            until you do.
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">Change your password.</p>
        )}
        <ChangePasswordForm forced={!!user.mustChangePassword} />
      </div>
    </div>
  );
}