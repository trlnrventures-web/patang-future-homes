import Link from "next/link";
import { getCurrentUser } from "@/lib/crm/data";
import { redirect } from "next/navigation";
import { AuthProvider } from "@/components/crm/AuthProvider";
import CrmSidebar from "@/components/crm/CrmSidebar";

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
              <Link href="/crm/dashboard" className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
                  </svg>
                </span>
                <span className="text-sm font-bold text-primary">Patang CRM</span>
              </Link>
              <span className="text-xs font-medium text-muted">{user.name}</span>
            </header>

            <main className="flex-1 p-4 pb-24 md:p-6 md:pb-10">{children}</main>
          </div>
        </div>

        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-white md:hidden">
          {[
            { href: "/crm/dashboard", label: "Home", icon: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" },
            { href: "/crm/leads", label: "Leads", icon: "M17 20h5v-2a3 3 0 0 0-5-2.11M9 20H4v-2a3 3 0 0 1 5-2.11M16 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm5 16v-2a3 3 0 0 0-5-2.11M16 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" },
            { href: "/crm/messages", label: "Messages", icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10ZM8 10h8M8 14h5" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-muted"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d={item.icon} />
              </svg>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </AuthProvider>
  );
}