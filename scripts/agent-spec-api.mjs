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
    "popover-content": "PopoverContentControl",
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
function splitProps(source) {
  const result = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") quote = char;
    else if (/[([{]/.test(char)) depth++;
    else if (/[)\]}]/.test(char)) depth--;
    else if (char === "," && depth === 0) {
      result.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  result.push(source.slice(start).trim());
  return result;
}

function componentContracts(
  markdown,
  layout = new Set(),
  svgProps = new Set(),
) {
  const entries = [
    ...markdown.matchAll(/^- <([\w-]+)>: (.*); children: (.*)$/gm),
  ].map((m) => ({ name: m[1], props: splitProps(m[2]), children: m[3] }));
  const headings = [...markdown.matchAll(/^#### Component: ([\w-]+)$/gm)];
  for (const [index, heading] of headings.entries()) {
    const section = markdown.slice(
      heading.index + heading[0].length,
      headings[index + 1]?.index,
    );
    const block = /^```text\nProperties:([^]*?)\n\nChildren: (.*)\n```/m.exec(
      section,
    );
    if (!block) throw new Error("Missing property block: " + heading[1]);
    entries.push({
      name: heading[1],
      props: block[1].trim().split(/\n\s*/).filter(Boolean),
      children: block[2],
    });
  }
  const contracts = new Map();
  for (const { name, props: fields, children } of entries) {
    if (contracts.has(name)) throw new Error("Duplicate component: " + name);
    const props = new Set();
    for (const field of fields) {
      if (["none", "no props"].includes(field)) continue;
      if (field === "layout" || field === "svg props") {
        for (const prop of field === "layout" ? layout : svgProps)
          props.add(prop);
      } else {
        const match = /^([\w-]+)\??:/.exec(field);
        if (!match) throw new Error("Invalid property: " + name + "." + field);
        if (props.has(match[1]))
          throw new Error("Duplicate property: " + name + "." + match[1]);
        props.add(match[1]);
      }
    }
    contracts.set(name, { props, children });
  }
  return contracts;
}

export function documentedApi(markdown, layout, svgProps) {
  return new Map(
    [...componentContracts(markdown, layout, svgProps)].map(
      ([name, contract]) => [name, contract.props],
    ),
  );
}

export function sharedProps(markdown, name) {
  const tail = markdown.split("Shared " + name + " props")[1];
  if (!tail) throw new Error("Missing shared props: " + name);
  const body = tail.slice(tail.indexOf(":") + 1).trimStart();
  const section = body.startsWith("```text")
    ? body.slice(8, body.indexOf("\n```"))
    : body.split("\n\n")[0];
  // Expanded references use text blocks; compact layout definitions use inline code.
  const expanded = body.startsWith("```text");
  if (name === "SVG" && !expanded)
    return new Set(section.split(".")[0].split(/,\s*/));
  return new Set(
    [...section.matchAll(expanded ? /^([\w-]+)\??:/gm : /`([\w-]+)\??:/g)].map(
      (m) => m[1],
    ),
  );
}

export function executableExamples(markdown, file) {
  const examples = [];
  const lines = markdown.split("\n");
  let heading = "document";
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,6} /.test(lines[i])) heading = lines[i].replace(/^#+ /, "");
    const opening = /^(`{3,}|~{3,})dil\s*$/.exec(lines[i]);
    if (!opening) continue;
    const line = i + 1;
    const source = [];
    const closing = new RegExp("^" + opening[1] + "\\s*$");
    while (++i < lines.length && !closing.test(lines[i])) source.push(lines[i]);
    if (i === lines.length)
      throw new Error(`${file}:${line}: Unclosed DIL fence`);
    examples.push({
      name: `${file}:${line}: ${heading}`,
      source: source.join("\n") + "\n",
    });
  }
  return examples;
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
  const contracts = componentContracts(markdown);
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
  const svgNodes = new Set();
  function markSvg(id, svg = false) {
    const node = byId.get(id);
    if (!node) return;
    if (svg || node.name === "svg") svgNodes.add(id);
    for (const link of links.filter((l) => l.parent === id))
      markSvg(link.child, svg || node.name === "svg");
  }
  markSvg(0);
  const requiredParent = {
    "table-row": "table",
    "table-cell": "table-row",
    "popover-trigger": "popover",
    "popover-content": "popover",
    "carousel-item": "carousel",
    radio: "radio-group",
  };
  function elementParent(id) {
    const parent = byId.get(links.find((link) => link.child === id)?.parent);
    return parent && ["if", "branch", "each"].includes(parent.kind)
      ? elementParent(parent.id)
      : parent;
  }
  for (const node of nodes) {
    if (node.kind !== "element") continue;
    if (svgNodes.has(node.id)) continue;
    const contract = contracts.get(node.name)?.children;
    const parent = requiredParent[node.name];
    if (parent && elementParent(node.id)?.name !== parent)
      errors.push(node.name + " requires parent " + parent);
    if (
      [
        "button",
        "pressable",
        "input",
        "slider",
        "checkbox",
        "radio-group",
        "radio",
        "segmented-control",
      ].includes(node.name)
    ) {
      let ancestor = elementParent(node.id);
      while (ancestor) {
        if (["button", "pressable"].includes(ancestor.name)) {
          errors.push(
            ancestor.name + " cannot contain interactive " + node.name,
          );
          break;
        }
        ancestor = elementParent(ancestor.id);
      }
    }
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
