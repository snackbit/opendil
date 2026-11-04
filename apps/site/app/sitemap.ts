import type { MetadataRoute } from "next";
import { exampleIds } from "@/lib/examples/ids";
import { absoluteUrl } from "@/lib/source/site-url";
import { source } from "@/lib/source";

export const dynamic = "force-static";

/** Every page: the landing page, each docs page, and each demo example. */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    "/",
    ...source.getPages().map((page) => page.url + "/"),
    ...exampleIds.map((id) => `/demo/${id}/`),
  ];
  return paths.map((path) => ({ url: absoluteUrl(path) }));
}
