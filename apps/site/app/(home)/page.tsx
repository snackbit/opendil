import type { Metadata } from "next";
import { ExampleCards, OpenSourceLine } from "@/components/home/example-cards";
import { Hero } from "@/components/home/hero";
import { heroExamples } from "@/components/home/hero-examples";
import { HeroPreview } from "@/components/home/hero-preview";
import { Highlights, RuntimeOverview } from "@/components/home/highlights";
import charts from "@/components/home/assets/charts.png";
import "@/components/home/home.css";

const title = "OpenDIL — Generative interfaces for your agents";
const description =
  "A React renderer for streaming, interactive interfaces. Compose Markdown, controls, charts, and state in one declarative document.";
// Canonical URLs name the production domain, also on preview deployments (as in the Astro site).
const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const siteUrl =
  process.env.SITE_URL ??
  (vercelProduction ? `https://${vercelProduction}` : "https://opendil.com");
const pageUrl = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { absolute: title },
  description,
  alternates: { canonical: pageUrl },
  // A page-level openGraph replaces the inherited one, so it lists the image itself.
  openGraph: {
    title,
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

export default function HomePage() {
  const examples = heroExamples();
  return (
    <main className="od-home">
      <Hero />
      <section className="od-container" aria-label="Source to interface">
        <div className="od-preview-frame">
          <HeroPreview
            examples={examples}
            fallback={examples["team-budget"]?.source ?? ""}
          />
        </div>
      </section>
      <Highlights />
      <RuntimeOverview />
      <ExampleCards />
      <OpenSourceLine />
    </main>
  );
}
