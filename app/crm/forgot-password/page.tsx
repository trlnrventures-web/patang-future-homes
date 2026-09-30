import type { Metadata } from "next";
import ForgotPasswordForm from "@/components/crm/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Reset Password | Patang Future Homes",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
              <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
            </svg>
          </div>
          <h1 className="mt-4 text-xl font-bold text-primary">
            Forgot your password?
          </h1>
          <p className="mt-1 text-sm text-muted">
            We will email you a link to set a new one.
          </p>
        </div>
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
