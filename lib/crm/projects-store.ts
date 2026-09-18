import fs from "fs";
import path from "path";

const PROJECTS_PATH = path.join(process.cwd(), "data", "projects.json");

export type ProjectRecord = Record<string, unknown> & { slug: string };

export function readProjectsFile(): ProjectRecord[] {
  const raw = fs.readFileSync(PROJECTS_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as ProjectRecord[]) : [];
}

export function writeProjectsFile(projects: ProjectRecord[]): void {
  const tmp = `${PROJECTS_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(projects, null, 2) + "\n", "utf-8");
  fs.renameSync(tmp, PROJECTS_PATH);
}

export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isArchived(p: ProjectRecord): boolean {
  return p.isActive === false || p.archived === true;
}

export function getProjectOrDefault(projects: ProjectRecord[], slug: string): ProjectRecord | undefined {
  return projects.find((p) => p.slug === slug);
}