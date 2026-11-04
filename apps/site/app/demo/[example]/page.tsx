import type { Metadata } from "next";
import { notFound } from "next/navigation";
import charts from "@/components/home/assets/charts.png";
import { WorkbenchIsland } from "@/components/workbench/workbench-island";
import { exampleById, exampleIds, isExampleId } from "@/lib/examples/catalog";
import { pageSource } from "@/lib/examples/sources";
import { basePath, siteOrigin } from "@/lib/source/site-url";

export const dynamicParams = false;

export function generateStaticParams() {
  return exampleIds.map((example) => ({ example }));
}

export async function generateMetadata(
  props: PageProps<"/demo/[example]">,
): Promise<Metadata> {
  const { example } = await props.params;
  if (!isExampleId(example)) return {};
  const { title, description } = exampleById(example);
  // Same title and social metadata as the Astro demo pages (site-layout.astro).
  const pageTitle = `${title} · OpenDIL demo`;
  const pageUrl = `${basePath}/demo/${example}/`;
  return {
    metadataBase: new URL(siteOrigin),
    title: { absolute: pageTitle },
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title: pageTitle,
      description,
      type: "website",
      url: pageUrl,
      images: [
        {
          url: charts.src,
          width: charts.width,
          height: charts.height,
          alt: "Charts rendered by OpenDIL",
        },
      ],
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function DemoPage(props: PageProps<"/demo/[example]">) {
  const { example } = await props.params;
  if (!isExampleId(example)) notFound();
  const { title, description } = exampleById(example);
  return (
    <main className="flex-1">
      <h1 className="sr-only">{title}</h1>
      <p className="sr-only">{description}</p>
      {/* A new example is a new workbench: drafts, replay and settings start from that example. */}
      <WorkbenchIsland
        key={example}
        initialId={example}
        source={pageSource(example)}
      />
    </main>
  );
}
