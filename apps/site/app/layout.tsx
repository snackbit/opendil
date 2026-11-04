import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteProvider } from "@/components/site/provider";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SkipLink } from "@/components/site/skip-link";
import "./global.css";

export const metadata: Metadata = {
  title: { default: "OpenDIL", template: "%s · OpenDIL" },
  description: "Streaming interactive documents for React.",
};

/** The only root layout: every route shares it and its header, so navigation stays client-side. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <SiteProvider>
          <SkipLink />
          <SiteHeader />
          <div id="od-content" className="flex flex-1 flex-col" tabIndex={-1}>
            {children}
          </div>
          <SiteFooter />
        </SiteProvider>
      </body>
    </html>
  );
}
