import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
export const generatedThrough = StateEffect.define<number>();
function marks(length: number, end: number): DecorationSet {
  return end < length
    ? Decoration.set([
        Decoration.mark({ class: "od-code-upcoming" }).range(end, length),
      ])
    : Decoration.none;
}
export const generatedCode = StateField.define<{
  end: number;
  decorations: DecorationSet;
}>({
  create: (state) => ({ end: state.doc.length, decorations: Decoration.none }),
  update(value, transaction) {
    let end = value.end;
    for (const effect of transaction.effects)
      if (effect.is(generatedThrough))
        end = Math.max(0, Math.min(transaction.newDoc.length, effect.value));
    return transaction.docChanged || end !== value.end
      ? { end, decorations: marks(transaction.newDoc.length, end) }
      : value;
  },
  provide: (field) =>
    EditorView.decorations.from(field, (value) => value.decorations),
});
