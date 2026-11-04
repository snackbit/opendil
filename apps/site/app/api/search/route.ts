import { createFromSource } from "fumadocs-core/search/server";
import { source } from "@/lib/source";

export const dynamic = "force-static";

/** The exported search index; the browser downloads it once and searches locally, in dev too. */
export const { staticGET: GET } = createFromSource(source);
