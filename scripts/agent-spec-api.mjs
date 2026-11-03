import { readFileSync } from "node:fs";
import ts from "typescript";

const base = "packages/opendil/src/dil/";
function source(path) {
  return ts.createSourceFile(
    path,
    readFileSync(base + path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}
function visit(node, fn) {
  fn(node);
  ts.forEachChild(node, (child) => visit(child, fn));
}
function properties(node) {
  const names = new Set();
  visit(node, (n) => {
    if (
      ts.isPropertyAccessExpression(n) &&
      n.expression.getText() === "attributes"
    )
      names.add(n.name.text);
    if (
      ts.isElementAccessExpression(n) &&
      n.expression.getText() === "attributes" &&
      ts.isStringLiteral(n.argumentExpression)
    )
      names.add(n.argumentExpression.text);
    if (
      ts.isCallExpression(n) &&
      n.expression.getText() === "invoke" &&
      ts.isStringLiteral(n.arguments[1])
    )
      names.add(n.arguments[1].text);
  });
  return names;
}
function functionNode(file, name) {
  let found;
  visit(file, (n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === name) found = n;
  });
  if (!found) throw new Error("Missing API owner: " + name);
  return found;
}
export function extractApi() {
  const primitive = source("widgets/primitives/primitive.tsx");
  const controls = source("widgets/controls.tsx");
  const values = source("widgets/primitives/attribute-values.ts");
  const layout = properties(functionNode(values, "layoutStyle"));
  const svgProps = new Set();
  visit(values, (n) => {
    if (ts.isVariableDeclaration(n) && n.name.getText() === "SVG_ATTRIBUTES") {
      visit(n, (child) => {
        if (ts.isStringLiteral(child)) svgProps.add(child.text);
      });
    }
  });
  const owners = {
    button: "ButtonControl",
    pressable: "PressableControl",
    checkbox: "CheckboxControl",
    slider: "SliderControl",
    input: "InputControl",
    "segmented-control": "SegmentedControl",
    "radio-group": "RadioGroupControl",
    radio: "RadioControl",
  };
  const api = new Map();
  visit(primitive, (n) => {
    if (!ts.isSwitchStatement(n) || n.expression.getText() !== "node.name")
      return;
    let pending = [];
    for (const clause of n.caseBlock.clauses) {
      if (!ts.isCaseClause(clause)) continue;
      pending.push(clause.expression.text);
      if (!clause.statements.length) continue;
      for (const name of pending) {
        const props = properties(clause);
        // Structural/presentation decisions outside dispatch do not expose props.
        if (
          [
            "box",
            "row",
            "grid",
            "grid-item",
            "table-cell",
            "pressable",
          ].includes(name)
        )
          for (const p of layout) props.add(p);
        if (owners[name])
          for (const p of properties(functionNode(controls, owners[name])))
            props.add(p);
        if (
          [
            "button",
            "input",
            "slider",
            "radio-group",
            "segmented-control",
          ].includes(name)
        )
          props.add("aria-label");
        if (name === "NodeGraph")
          for (const p of properties(
            functionNode(source("widgets/graphs/node-graph.tsx"), "NodeGraph"),
          ))
            props.add(p);
        api.set(name, props);
      }
      pending = [];
    }
  });
  return { api, layout, svgProps };
}
export function documentedApi(markdown, layout) {
  const api = new Map();
  for (const match of markdown.matchAll(/^- <([\w-]+)>: (.*); children:/gm)) {
    const props = new Set(
      [...match[2].matchAll(/(?:^|, )([\w-]+)\??:/g)].map((m) => m[1]),
    );
    if (/\blayout\b/.test(match[2])) for (const p of layout) props.add(p);
    api.set(match[1], props);
  }
  return api;
}
export function compareApi(actual, documented) {
  const errors = [];
  for (const [name, props] of actual) {
    if (!documented.has(name)) {
      errors.push("Undocumented component: " + name);
      continue;
    }
    for (const prop of props)
      if (!documented.get(name).has(prop))
        errors.push(`Missing property: ${name}.${prop}`);
  }
  for (const [name, props] of documented) {
    if (name === "svg") continue;
    if (!actual.has(name)) {
      errors.push("Nonexistent component: " + name);
      continue;
    }
    for (const prop of props)
      if (!actual.get(name).has(prop))
        errors.push(`Unsupported property: ${name}.${prop}`);
  }
  return errors;
}

export function compositionErrors(nodes, links, markdown) {
  const contracts = new Map(
    [...markdown.matchAll(/^- <([\w-]+)>: .*; children: (.*)$/gm)].map((m) => [
      m[1],
      m[2],
    ]),
  );
  const errors = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  function children(id) {
    return links
      .filter((l) => l.parent === id)
      .flatMap((l) => {
        const n = byId.get(l.child);
        return n && ["if", "branch", "each"].includes(n.kind)
          ? children(n.id)
          : n
            ? [n]
            : [];
      });
  }
  for (const node of nodes) {
    if (node.kind !== "element") continue;
    const contract = contracts.get(node.name);
    if (
      !contract ||
      ["generic", "inline", "raw", "SVG elements"].includes(contract)
    )
      continue;
    const content = children(node.id).filter(
      (n) => n.kind !== "markdown" || n.text.trim(),
    );
    if (contract === "none" && content.length)
      errors.push(node.name + " accepts no children");
    if (contract !== "none") {
      const allowed = contract.replace(/^one /, "").split(" | ");
      if (contract.startsWith("one ") && content.length !== 1)
        errors.push(node.name + " requires one child");
      for (const child of content)
        if (child.kind !== "element" || !allowed.includes(child.name))
          errors.push(
            node.name + " cannot contain " + (child.name || child.kind),
          );
    }
  }
  return errors;
}
