/*
 * Google Translate (ours, or the browser's own "Translate this page") swaps
 * the text in the page for its own <font> wrappers. React still holds the
 * text nodes it made, so the next time it removes or moves one of them the
 * browser throws "Failed to execute 'removeChild' on 'Node'" (or
 * insertBefore), and the whole page went white.
 *
 * The well-known fix (facebook/react#11538): when the node is no longer
 * where React thinks it is, do nothing instead of throwing. React's own
 * view stays right; only text Translate has already replaced is involved.
 */
export function guardAgainstTranslate() {
  if (typeof Node !== 'function' || !Node.prototype || Node.prototype.__emoormGuarded) return;
  const { removeChild, insertBefore } = Node.prototype;

  Node.prototype.removeChild = function guardedRemoveChild(child) {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child);
  };

  Node.prototype.insertBefore = function guardedInsertBefore(node, reference) {
    if (reference && reference.parentNode !== this) return node;
    return insertBefore.call(this, node, reference);
  };

  Object.defineProperty(Node.prototype, '__emoormGuarded', { value: true });
}
