import Link from "next/link";
import { getCurrentUser } from "@/lib/crm/data";
import { ensureMonthlySalaryDrafts } from "@/lib/crm/salary-sweep";
import { AuthProvider } from "@/components/crm/AuthProvider";
import CrmSidebar from "@/components/crm/CrmSidebar";
import LogoutButton from "@/components/crm/LogoutButton";
import MobileNav from "@/components/crm/MobileNav";

export default async function CrmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    return <>{children}</>;
  }

  // First CRM visit after a month closes drafts last month's salaries as
  // pending rows. Guarded by a settings key, so this is one tiny read on every
  // request after that, and it never throws into the page.
  await ensureMonthlySalaryDrafts();

  return (
    <AuthProvider initialUser={user}>
      <div className="min-h-screen bg-background">
        <div className="flex min-h-screen">
          <aside className="hidden w-60 shrink-0 md:block">
            <div className="sticky top-0 h-screen">
              <CrmSidebar userName={user.name} userRole={user.role} />
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Mobile top bar */}
            <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-white px-4 py-3 md:hidden">
              <Link href="/crm/dashboard" className="flex items-center">
                <img
                  src="/brand/PFH_512_nobg_horizontal.png"
                  alt="Patang CRM"
                  className="h-7 w-auto"
                />
              </Link>
              <span className="flex items-center gap-2 text-xs font-medium text-muted">
                <Link
                  href="/crm/my-account"
                  className="font-semibold text-navy transition-colors hover:text-primary"
                >
                  {user.name}
                </Link>
                <LogoutButton compact />
              </span>
            </header>

            <main className="flex-1 p-4 pb-24 md:p-6 md:pb-10">{children}</main>
          </div>
        </div>

        {/* Mobile bottom nav */}
        <MobileNav userRole={user.role} />
      </div>
    </AuthProvider>
  );
}