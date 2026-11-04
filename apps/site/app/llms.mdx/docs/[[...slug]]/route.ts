import { notFound } from "next/navigation";
import { source } from "@/lib/source";
import { pageMarkdown } from "@/lib/source/llms";

export const dynamic = "force-static";
export const dynamicParams = false;

/** A docs page as Markdown; next.config.ts rewrites /docs/<slug>.md here. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/llms.mdx/docs/[[...slug]]">,
) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();
  return new Response(await pageMarkdown(page), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({ slug: page.slugs }));
}
