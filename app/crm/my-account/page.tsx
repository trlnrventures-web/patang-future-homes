import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/crm/data";
import MyAccountForm from "@/components/crm/MyAccountForm";

export const metadata: Metadata = {
  title: { absolute: "My Account | Patang CRM" },
  robots: { index: false, follow: false },
};

export default async function MyAccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");
  if (user.mustChangePassword) redirect("/crm/change-password");

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-navy">My Account</h1>
        <p className="mt-1 text-sm text-muted">
          {user.name} · {user.email}
        </p>
      </div>
      <MyAccountForm />
    </div>
  );
}
