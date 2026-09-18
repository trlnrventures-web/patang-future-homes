import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/crm/data";
import PropertyForm from "@/components/crm/PropertyForm";
import { readProjectsFile } from "@/lib/crm/projects-store";

export const metadata: Metadata = {
  title: { absolute: "Edit Property | Patang CRM" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");
  if (user.role !== "admin" && user.role !== "sales_head") redirect("/crm/dashboard");

  const { slug } = await params;
  const project = readProjectsFile().find((p) => p.slug === slug);
  if (!project) notFound();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-primary">Edit Property</h1>
        <p className="mt-0.5 text-sm text-muted">
          Editing <span className="font-semibold text-navy">{String(project.title)}</span>. Changes go
          live on the next deployment.
        </p>
      </div>
      <PropertyForm mode="edit" initial={project} />
    </div>
  );
}