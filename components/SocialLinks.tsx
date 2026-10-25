import type { IconType } from "react-icons";
import {
  FaLinkedin,
  FaSquareEnvelope,
  FaSquareGithub,
  FaSquareXTwitter,
} from "react-icons/fa6";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

// Font Awesome glyphs, compiled to inline SVG (no webfont download).
const ICONS: Record<string, IconType> = {
  GitHub: FaSquareGithub,
  LinkedIn: FaLinkedin,
  Twitter: FaSquareXTwitter,
};

const LINKS = [
  ...SITE.socials
    .filter((social) => social.label in ICONS)
    .map((social) => ({ label: social.label, href: social.url, Icon: ICONS[social.label], external: true })),
  { label: "Email", href: `mailto:${SITE.email}`, Icon: FaSquareEnvelope, external: false },
];

// Profile and email links for the sidebar and the mobile menu. rel="me" ties
// the profiles to this site for identity checks.
export function SocialLinks({ className }: { className?: string }) {
  return (
    <ul className={cn("flex gap-2", className)}>
      {LINKS.map(({ label, href, Icon, external }) => (
        <li key={label}>
          <a
            href={href}
            {...(external && { target: "_blank", rel: "me noopener" })}
            aria-label={label}
            title={external ? label : SITE.email}
            className="-m-1 block p-1 text-muted-foreground cursor-none transition-colors hover:text-accent"
          >
            <Icon aria-hidden className="h-4 w-4" />
          </a>
        </li>
      ))}
    </ul>
  );
}
