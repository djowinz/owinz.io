export const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/writing", label: "Writing" },
  { href: "/projects", label: "Projects" },
  { href: "/talks", label: "Talks" },
  { href: "/contact", label: "Contact" },
] as const;

export function isActive(pathname: string, href: string): boolean {
  const current = pathname.replace(/\/+$/, "") || "/";
  if (href === "/") return current === "/";
  return current === href || current.startsWith(`${href}/`);
}
