"use client";

import { useEffect, useState, useCallback } from "react";
import { MESSAGE_CATEGORIES, MESSAGE_CATEGORY_LABELS, AVAILABLE_VARIABLES } from "@/lib/crm/messages";
import { Badge, Button, Toast } from "./ui";

type Template = {
  id: number;
  name: string;
  category: string;
  body: string;
  active: boolean;
  isPersonal: boolean;
  createdByName: string;
  updatedAt: string | null;
  createdAt: string;
};

export default function TemplateManager({
  isAdmin,
}: {
  isAdmin: boolean;
}) {
  const [shared, setShared] = useState<Template[]>([]);
  const [mine, setMine] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    name: "",
    category: "follow_up",
    body: "",
    active: true,
  });

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 1800);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sharedRes, mineRes] = await Promise.all([
        fetch("/crm/api/templates?scope=shared"),
        fetch("/crm/api/templates?scope=mine"),
      ]);
      if (sharedRes.ok) {
        const data = await sharedRes.json();
        setShared(data.templates);
      }
      if (mineRes.ok) {
        const data = await mineRes.json();
        setMine(data.templates);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/crm/api/templates?scope=shared"),
      fetch("/crm/api/templates?scope=mine"),
    ])
      .then(([sharedRes, mineRes]) => {
        if (sharedRes.ok) sharedRes.json().then((d) => setShared(d.templates));
        if (mineRes.ok) mineRes.json().then((d) => setMine(d.templates));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.body.trim()) return;

    const res = await fetch("/crm/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, isPersonal: !isAdmin }),
    });
    if (res.ok) {
      showToast("Template saved");
      setCreating(false);
      setForm({ name: "", category: "follow_up", body: "", active: true });
      load();
    } else {
      showToast("Could not save template");
    }
  };

  const updateTemplate = async (
    id: number,
    patch: Partial<Template>
  ) => {
    const res = await fetch(`/crm/api/templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      showToast("Updated");
      setEditingId(null);
      load();
    } else {
      showToast("Could not update template");
    }
  };

  const toggleActive = async (t: Template) => {
    await updateTemplate(t.id, { active: !t.active });
  };

  const renderTemplate = (t: Template) => {
    const isEditing = editingId === t.id;
    const canEdit = t.isPersonal ? t.createdByName === "" || isAdmin : isAdmin;

    return (
      <div
        key={t.id}
        className={`rounded-2xl border p-4 ${
          t.active ? "border-border bg-white" : "border-border bg-background/50 opacity-60"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-navy">{t.name}</span>
            <Badge color="bg-primary/10 text-primary">
              {MESSAGE_CATEGORY_LABELS[t.category] || t.category}
            </Badge>
            {t.isPersonal && <Badge color="bg-violet-100 text-violet-700">Personal</Badge>}
            {!t.active && <Badge color="bg-gray-100 text-gray-600">Inactive</Badge>}
          </div>
          <div className="flex items-center gap-1.5">
            {canEdit && !isEditing && (
              <>
                <Button size="sm" variant="ghost" onClick={() => {
                  setEditingId(t.id);
                  setForm({ name: t.name, category: t.category, body: t.body, active: t.active });
                }}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggleActive(t)}>
                  {t.active ? "Deactivate" : "Activate"}
                </Button>
              </>
            )}
          </div>
        </div>

        {isEditing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateTemplate(t.id, {
                name: form.name,
                category: form.category,
                body: form.body,
                active: form.active,
              });
            }}
            className="mt-3 space-y-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background/50 px-3 py-2 text-sm text-navy outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background/50 px-3 py-2 text-sm text-navy outline-none"
                >
                  {MESSAGE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Message Body</label>
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={5}
                className="w-full resize-y rounded-xl border border-border bg-background/50 px-3 py-2 text-sm text-navy outline-none"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Save</Button>
              <Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_VARIABLES.map((v) => (
                <button
                  key={v}
                  type="button"
                  className="rounded-md bg-primary/5 px-2 py-1 text-[10px] font-semibold text-primary"
                  onClick={() => setForm((f) => ({ ...f, body: f.body + v }))}
                >
                  {v}
                </button>
              ))}
            </div>
          </form>
        ) : (
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted">
            {t.body}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Toast message={toast} visible={!!toast} />

      {!creating && (
        <Button onClick={() => setCreating(true)}>+ New Template</Button>
      )}

      {creating && (
        <form onSubmit={save} className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <h3 className="text-sm font-bold text-primary">Create {isAdmin ? "Shared" : "Personal"} Template</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Follow-up - Festive Offer"
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy outline-none"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy outline-none"
              >
                {MESSAGE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Message Body</label>
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={5}
              placeholder="Hi {{name}} sir, ..."
              className="w-full resize-y rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy outline-none"
              required
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {AVAILABLE_VARIABLES.map((v) => (
              <button
                key={v}
                type="button"
                className="rounded-md bg-primary/5 px-2 py-1 text-[10px] font-semibold text-primary"
                onClick={() => setForm((f) => ({ ...f, body: f.body + v }))}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button type="submit">Save Template</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-100" />)}
        </div>
      ) : (
        <>
          {isAdmin && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-primary">Shared Templates ({shared.length})</h2>
              {shared.length === 0 && <p className="text-xs text-muted">No shared templates yet.</p>}
              {shared.filter((t) => t.active).map(renderTemplate)}
              {shared.filter((t) => !t.active).map(renderTemplate)}
            </section>
          )}
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-primary">
              My Templates ({mine.length})
            </h2>
            {mine.length === 0 && (
              <p className="rounded-xl border border-dashed border-border bg-white p-4 text-xs text-muted">
                Your personal templates will appear here. Use &quot;Save as my template&quot; from the Message Center.
              </p>
            )}
            {mine.map(renderTemplate)}
          </section>
        </>
      )}
    </div>
  );
}