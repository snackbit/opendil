import { exampleById, isExampleId } from "@/lib/examples/catalog";
import { pageSource } from "@/lib/examples/sources";
import { LiveExampleIsland } from "./live-example-island";
import type { LiveExampleMode } from "./live-example-workbench";

export interface LiveExampleProps {
  id: string;
  /** The render mode the example starts in; readers can switch it in the settings. */
  mode?: LiveExampleMode;
}

/** An editable example from the catalog. The server passes its source to the client island. */
export function LiveExample({ id, mode }: LiveExampleProps) {
  if (!isExampleId(id))
    throw new Error(`<LiveExample id="${id}"> is not an example`);
  return (
    <LiveExampleIsland
      id={id}
      title={exampleById(id).title}
      source={pageSource(id)}
      mode={mode}
    />
  );
}
