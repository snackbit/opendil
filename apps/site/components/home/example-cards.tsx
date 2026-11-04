import { Activity, Network, SlidersHorizontal } from "lucide-react";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import type { ComponentType } from "react";
import charts from "./assets/charts.png";
import diagram from "./assets/graph.png";
import pricing from "./assets/pricing.png";

const repository = "https://github.com/snackbit/opendil";

interface ExampleCard {
  id: string;
  title: string;
  category: string;
  description: string;
  image: StaticImageData;
  Icon: ComponentType<{ size?: number }>;
}

const cards: readonly ExampleCard[] = [
  {
    id: "charts",
    title: "Reactive charts",
    category: "DATA",
    description: "Hover detail and multi-series selection from a document.",
    image: charts,
    Icon: Activity,
  },
  {
    id: "pricing",
    title: "Pricing calculator",
    category: "FORMS",
    description: "A seat slider and billing toggle update a derived total.",
    image: pricing,
    Icon: SlidersHorizontal,
  },
  {
    id: "graph",
    title: "Dependency graph",
    category: "DIAGRAMS",
    description: "Nodes and edges describe topology; selection reveals detail.",
    image: diagram,
    Icon: Network,
  },
];

/** Screenshots of three playground examples, each linking to its live version. */
export function ExampleCards() {
  return (
    <section className="od-section od-container" id="examples">
      <div className="od-section-top">
        <div>
          <div className="od-eyebrow">EXAMPLE SURFACES</div>
          <h2>Interfaces that arrive ready to use.</h2>
        </div>
        <Link className="od-text-link" href="/demo/deployment/">
          Explore the examples ↗
        </Link>
      </div>
      <p className="od-section-intro">
        Calculators, tables, charts, and diagrams, described in the same
        document language.
      </p>
      <div className="od-example-grid">
        {cards.map(({ id, title, category, description, image, Icon }) => (
          <Link key={id} className="od-example-card" href={"/demo/" + id + "/"}>
            <Image
              src={image}
              alt={description}
              sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 400px"
            />
            <div className="od-example-card-body">
              <span className="od-category">
                <Icon size={14} />
                {category}
              </span>
              <h3>{title}</h3>
              <p>{description}</p>
              <span className="od-text-link">Open this example ↗</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** The closing call to action. */
export function OpenSourceLine() {
  return (
    <section className="od-open-line od-container">
      <div>
        <h2>Open source. Open to what you build.</h2>
        <p>
          Read the language. Explore the runtime. Make it part of your
          application.
        </p>
      </div>
      <a className="od-link-button" href={repository}>
        Explore on GitHub ↗
      </a>
    </section>
  );
}
