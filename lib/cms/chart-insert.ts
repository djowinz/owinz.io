// Where the rich editor puts a new chart block. Charts are always top-level
// blocks: the site only renders a ```chart fence at the start of a line, and
// one inside a list item, quote, or table cell would be indented, prefixed with
// "> ", or flattened into the cell's text. Pure (no DOM), so it's unit-tested.
import { NodeSelection, type EditorState } from "@tiptap/pm/state";

/**
 * The range a new chart replaces: an empty top-level paragraph holding the
 * caret, or else the empty range right after the top-level block that holds
 * the selection (after a selected top-level node itself).
 */
export function chartInsertPos(state: EditorState): [number, number] {
  const { selection } = state;
  const { $from } = selection;
  // A selected top-level node, or a selection between top-level blocks.
  if ($from.depth === 0) {
    const at = selection instanceof NodeSelection ? selection.to : $from.pos;
    return [at, at];
  }
  const top = $from.node(1);
  if ($from.depth === 1 && top.type.name === "paragraph" && top.content.size === 0) {
    return [$from.before(1), $from.after(1)];
  }
  return [$from.after(1), $from.after(1)];
}
