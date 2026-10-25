import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignInForm } from "@/components/admin/SignInForm";
import { label } from "@/components/admin/ui";
import { devLoginEnabled } from "@/lib/auth";
import { getCmsUser } from "@/lib/cms/session";

export const metadata = { title: "Sign in" };

const NOT_INVITED = "That account hasn't been invited to the CMS. Ask an editor for an invite.";

// Better Auth's codes when the invite check in lib/auth.ts refuses an account
// (they differ between GitHub and the email link).
const ERRORS: Record<string, string> = {
  unable_to_create_user: NOT_INVITED,
  failed_to_create_user: NOT_INVITED,
  new_user_signup_disabled: NOT_INVITED,
  INVALID_TOKEN: "That sign-in link has expired or was already used.",
  EXPIRED_TOKEN: "That sign-in link has expired or was already used.",
};

async function AlreadySignedIn() {
  if (await getCmsUser()) redirect("/admin/");
  return null;
}

async function ErrorMessage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (!error) return null;
  return (
    <p role="alert" className="mb-8 border-l-2 border-red-500 pl-4 text-sm text-red-700 dark:text-red-400">
      {ERRORS[error] ?? "Sign-in didn't complete. Try again."}
    </p>
  );
}

export default function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-[440px] flex-col justify-center px-5 py-16">
      <Suspense>
        <AlreadySignedIn />
      </Suspense>
      <div className={`${label} mb-7 flex justify-between`}>
        <span>owinz.io</span>
        <span>CMS</span>
      </div>
      <h1 className="font-fraunces font-light text-[56px] sm:text-[72px] tracking-[-0.035em] leading-[0.95] mb-5">
        Sign <em className="font-fraunces-italic text-accent">in</em>.
      </h1>
      <p className="font-fraunces-italic italic font-light text-lg leading-snug text-muted mb-10">
        Writing, projects, and talks. Invited accounts only.
      </p>
      <Suspense>
        <ErrorMessage searchParams={searchParams} />
      </Suspense>
      <SignInForm devLogin={devLoginEnabled()} />
    </div>
  );
}
