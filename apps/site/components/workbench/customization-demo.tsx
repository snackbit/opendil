import { useCallback, useState } from "react";
import { DilRenderer, type ProgressiveReveal } from "@snackbit/opendil";
import { Button } from "@snackbit/opendil/ui";
import { customizationSource } from "@/lib/examples/customization";
import { ShellScope } from "./shell-scope";
import { primaryForeground } from "./appearance";
import { DEMO_RENDER_MODE } from "@/components/playback/defaults";
import { components as registeredComponents } from "@/lib/examples/custom-components";
function Broken(): never {
  throw new Error("Custom component failed");
}
const components = { ...registeredComponents, Broken };
const config = { Callout: { label: "Consumer component" } };
// These utilities are shipped in the renderer stylesheet, including inside its ShadowRoot.
const classes = { button: "rounded-full", Callout: "rounded-xl border p-4" };
const slots = { Callout: { title: "text-primary" } };
const neighbor = `# Independent host renderer
{@body const [count,setCount]=DIL.useState(0)}
<button onClick={()=>setCount(n=>n+1)}>Increment host neighbor</button>
<text>Host neighbor count: {count}</text>`;
export function CustomizationDemo({
  progressiveReveal = false,
  mode = DEMO_RENDER_MODE,
  text = customizationSource,
  appearance,
  primary,
  radius = 12,
  buttonClass,
  onAppearance,
}: {
  progressiveReveal?: ProgressiveReveal;
  mode?: "host" | "shadow";
  text?: string;
  appearance?: "light" | "dark";
  primary?: string;
  radius?: number;
  buttonClass?: string;
  onAppearance?: ((value: "light" | "dark") => void) | undefined;
}) {
  const [dark, setDark] = useState(false);
  const [broken, setBroken] = useState(false);
  const theme = useCallback(() => {
    if (onAppearance) onAppearance(appearance === "dark" ? "light" : "dark");
    else setDark((value) => !value);
  }, [onAppearance, appearance]);
  const appliedDark = appearance ? appearance === "dark" : dark;
  const appliedPrimary = primary ?? (appliedDark ? "#a7f3d0" : "#156f55");
  const fail = useCallback(() => setBroken((value) => !value), []);
  return (
    <div className="demo-host">
      <ShellScope className="mb-4 flex gap-3">
        <Button onClick={theme}>Toggle custom theme</Button>
        <Button variant="outline" onClick={fail}>
          {broken ? "Restore component" : "Show component error"}
        </Button>
      </ShellScope>
      <DilRenderer
        progressiveReveal={progressiveReveal}
        key={String(broken)}
        mode={mode}
        showStatus={false}
        text={broken ? text + "\n<Broken />" : text}
        components={components}
        componentConfig={config}
        classNames={{
          ...classes,
          ...(buttonClass ? { button: buttonClass } : {}),
        }}
        slots={slots}
        appearance={appliedDark ? "dark" : "light"}
        tokens={{
          "--primary": appliedPrimary,
          "--primary-foreground": primaryForeground(appliedPrimary),
          "--radius": radius + "px",
        }}
      />
      <DilRenderer
        mode={mode}
        showStatus={false}
        text={neighbor}
        progressiveReveal={progressiveReveal}
        componentConfig={{ button: { variant: "outline" } }}
        classNames={{ button: "consumer-stock-button" }}
      />
    </div>
  );
}
