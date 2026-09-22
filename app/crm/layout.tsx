import Link from "next/link";
import { getCurrentUser } from "@/lib/crm/data";
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
                <span className="inline-block rounded-lg bg-navy p-1.5">
                  <img
                    src="/brand/PFH_512_white_nobg_horizontal.png"
                    alt="Patang CRM"
                    className="h-7 w-auto"
                  />
                </span>
              </Link>
              <span className="flex items-center gap-1 text-xs font-medium text-muted">
                {user.name}
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