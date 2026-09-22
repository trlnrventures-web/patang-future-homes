"use client";

import { useState } from "react";
import { projects } from "@/lib/projects";

const WHATSAPP_NUMBER = "917249138197";

const inputClass =
  "w-full rounded-lg border border-border bg-white px-4 py-3 text-sm text-navy outline-none transition-colors focus:border-primary";

export default function InquiryForm({
  defaultProject,
}: {
  defaultProject?: string;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [project, setProject] = useState(defaultProject || "");
  const [message, setMessage] = useState("");

  function saveLeadToCrm() {
    const base =
      process.env.NEXT_PUBLIC_CRM_URL ||
      (typeof window !== "undefined" &&
      (window.location.hostname.includes("crm.") || window.location.hostname === "localhost"))
        ? window.location.origin
        : "https://crm.patangfuturehomes.com";
    fetch(`${base}/api/inquiries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, project, message }),
    }).catch(() => {
      // CRM save is best-effort; WhatsApp flow should not be blocked
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const parts = [
      name ? `Name: ${name}` : null,
      phone ? `Phone: ${phone}` : null,
      project ? `Project: ${project}` : null,
      message ? `Message: ${message}` : null,
    ].filter(Boolean);

    const text = `Hello, I'd like to make an enquiry.%0A${parts.join("%0A")}`;
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${text}`, "_blank");
    saveLeadToCrm();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <input type="hidden" name="websiteProject" value={project} />
      <div>
        <label
          htmlFor="name"
          className="mb-1.5 block text-sm font-semibold text-muted"
        >
          Name
        </label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          placeholder="Your full name"
        />
      </div>

      <div>
        <label
          htmlFor="phone"
          className="mb-1.5 block text-sm font-semibold text-muted"
        >
          Phone
        </label>
        <input
          id="phone"
          type="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={inputClass}
          placeholder="+91 98765 43210"
        />
      </div>

      <div>
        <label
          htmlFor="project"
          className="mb-1.5 block text-sm font-semibold text-muted"
        >
          Property / Project
        </label>
        <select
          id="project"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className={inputClass}
        >
          <option value="">Select a property (optional)</option>
          {projects.map((p) => (
            <option key={p.slug} value={p.title}>
              {p.title}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="message"
          className="mb-1.5 block text-sm font-semibold text-muted"
        >
          Message
        </label>
        <textarea
          id="message"
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={`${inputClass} resize-none`}
          placeholder="Tell us what you're looking for..."
        />
      </div>

      <button
        type="submit"
        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-secondary"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path d="M20.52 3.48a1.6 1.6 0 0 0-1.9-.29L3.24 9.46a1.6 1.6 0 0 0 .13 2.93l5.4 2.08 2.08 5.4a1.6 1.6 0 0 0 2.93.13l6.27-15.38a1.6 1.6 0 0 0-.53-2.14zM8.4 12.22l7.06-4.22a.35.35 0 0 1 .5.47l-4.22 7.06a.36.36 0 0 1-.65-.18l-.32-2.2a.4.4 0 0 1 .05-.27l-.21-.2v-.05c0-.14.1-.32.25-.38z" />
        </svg>
        Send via WhatsApp
      </button>
    </form>
  );
}