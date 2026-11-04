import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { DocsMenuButton, NoNavTitle } from "@/components/site/docs-menu";
import { baseOptions } from "@/components/site/layout-options";
import { source } from "@/lib/source";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      {...baseOptions()}
      nav={{ enabled: true }}
      // The site header carries the brand; the sidebar keeps only the page tree.
      slots={{ header: DocsMenuButton, navTitle: NoNavTitle }}
      sidebar={{ collapsible: false }}
      tabs={false}
    >
      {children}
    </DocsLayout>
  );
}
