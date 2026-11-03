import { DilRenderer, type DilComponentProps } from "@snackbit/opendil";
function Custom({ children }: DilComponentProps) {
  return <aside>{children}</aside>;
}
export const isolated = (
  <DilRenderer text="# Stock" runtimeBaseUrl="/assets/" progressiveReveal />
);
export const host = (
  <DilRenderer
    mode="host"
    progressiveReveal
    text="<Custom>Content</Custom>"
    components={{ Custom }}
    tokens={{ "--primary": "purple" }}
  />
);
// @ts-expect-error Custom components require an explicit host-mode choice.
export const rejected = <DilRenderer text="" components={{ Custom }} />;
export const rejectedHostAsset = (
  // @ts-expect-error Runtime assets configure the isolated mode only.
  <DilRenderer mode="host" text="" runtimeBaseUrl="/assets/" />
);
