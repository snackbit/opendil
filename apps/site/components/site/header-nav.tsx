"use client";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  { label: "Home", href: "/", active: (path: string) => path === "/" },
  {
    label: "Playground",
    href: "/demo/deployment/",
    active: (path: string) => path.startsWith("/demo/"),
  },
  {
    label: "Docs",
    href: "/docs/",
    active: (path: string) => path.startsWith("/docs"),
  },
];

/** Primary navigation; the current section is marked for assistive technology and with a rule. */
export function PrimaryNav() {
  const path = usePathname();
  return (
    <nav className="od-primary-nav" aria-label="Main navigation">
      {sections.map((section) => (
        <Link
          key={section.href}
          href={section.href}
          aria-current={section.active(path) ? "page" : undefined}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}

/** Docs search: a labelled field on wide screens and an icon button on narrow ones. */
export function HeaderSearch() {
  const path = usePathname();
  const { enabled, hotKey, setOpenSearch } = useSearchContext();
  if (!enabled || !path.startsWith("/docs")) return null;
  const open = () => setOpenSearch(true);
  return (
    <>
      <button type="button" className="od-search" onClick={open}>
        <Search size={16} aria-hidden="true" />
        Search
        <kbd>
          {hotKey.map((key, index) => (
            <span key={index}>{key.display}</span>
          ))}
        </kbd>
      </button>
      <button
        type="button"
        className="od-icon-button od-search-icon"
        aria-label="Search the docs"
        onClick={open}
      >
        <Search size={18} aria-hidden="true" />
      </button>
    </>
  );
}

/** SiteHeader renders this empty element; docs pages fill it with their menu button. */
export const docsMenuSlotId = "od-docs-menu-slot";

/** Where docs pages place their sidebar menu button on narrow screens (see DocsMenuButton). */
export function DocsMenuSlot() {
  return <span id={docsMenuSlotId} className="od-docs-menu-slot" />;
}
