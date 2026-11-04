"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "./brand";
import { repository } from "./repository";

/** Footer for the landing page and playground; docs pages end with their own navigation. */
export function SiteFooter() {
  if (usePathname().startsWith("/docs")) return null;
  return (
    <footer className="od-footer od-container">
      <Brand />
      <span>Open source. Built for your application.</span>
      <nav aria-label="Footer">
        <Link href="/docs/">Documentation</Link>
        <a href={repository}>GitHub</a>
        <a href={repository + "/blob/main/LICENSE"}>Apache 2.0</a>
        <a href={repository + "/releases"}>Releases</a>
      </nav>
      <p className="od-footer-credit">
        Made by <a href="https://turtledev.net">Felix Faust</a>.
      </p>
    </footer>
  );
}
