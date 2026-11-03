import { exampleById } from "../../examples/catalog";
import { DemoRenderer } from "../../demo-renderer";
import { sitePath } from "../links";
import { useVisibleExample } from "../examples/use-visible-example";
export interface LiveExampleProps {
  id: string;
}
export function LiveExample({ id }: LiveExampleProps) {
  const example = exampleById(id);
  const { root, visible } = useVisibleExample();
  return (
    <div className="not-content od-live-example" ref={root}>
      <div className="od-example-toolbar">
        <span>Live example</span>
        <a href={sitePath("demo/" + id + "/")}>Open in demo ↗</a>
      </div>
      {visible ? (
        <DemoRenderer text={example.source()} />
      ) : (
        <div className="od-live-placeholder">{example.title}</div>
      )}
    </div>
  );
}
