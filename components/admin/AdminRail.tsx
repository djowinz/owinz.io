import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { can } from "@/lib/cms/permissions";
import { requireCmsUser } from "@/lib/cms/session";
import { AdminNav } from "./AdminNav";
import { SignOutButton } from "./SignOutButton";
import { label } from "./ui";

const ROLE_LABEL = { editor: "Editor", writer: "Writer", contributor: "Contributor" } as const;

export async function AdminRail() {
  const user = await requireCmsUser();
  const items = [
    { href: "/admin/", label: "Overview" },
    { href: "/admin/writing/", label: "Writing" },
    ...(can(user, "manageTaxonomy") ? [{ href: "/admin/taxonomy/", label: "Categories & tags" }] : []),
    ...(can(user, "manageUsers") ? [{ href: "/admin/users/", label: "People" }] : []),
  ];

  return (
    <div className="flex flex-col gap-6 p-5 sm:px-8 lg:sticky lg:top-0 lg:h-dvh lg:p-8">
      <div className="flex items-baseline justify-between lg:block">
        <Link href="/admin/" className="font-fraunces text-[22px] font-medium tracking-wide">
          owinz.io
        </Link>
        <div className={`${label} lg:mt-1`}>CMS</div>
      </div>

      <AdminNav items={items} />

      <div className="hidden lg:block flex-1" />

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-edge pt-5 lg:block lg:border-0 lg:pt-0">
        <div className="min-w-0">
          <div className="truncate text-sm">{user.name}</div>
          <div className={label}>{ROLE_LABEL[user.role]}</div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.2px] text-muted-foreground lg:mt-5 lg:flex-col lg:items-start">
          <Link href="/" className="transition-colors hover:text-accent">
            View site ↗
          </Link>
          <SignOutButton />
        </div>
        <div className="font-mono text-[11px] text-muted-foreground lg:mt-6 lg:flex lg:justify-between">
          <span className="hidden lg:inline">MMXXVI</span>
          <ThemeToggle className="cursor-pointer" />
        </div>
      </div>
    </div>
  );
}
