/*
 * What Google Translate must leave as it is: prices (₱1,250.00 turned into
 * words or reordered), the names of products, shops and people (a shop
 * called "Bahay Kubo Crafts" is not translated), and what people wrote to
 * each other in chats.
 *
 * The site has no list of these in its markup, so they are marked here by
 * their class names, on the page as it is and on everything added later
 * (a MutationObserver started before Google's own, so ours runs first).
 * Marked elements get translate="no" and the notranslate class, which the
 * translator skips.
 *
 * Started only when another language is chosen (main.jsx).
 */

const KEEP = [
  // Prices: …-price classes (not "price-note", "price-row" and the like).
  '[class$="-price"]', '[class*="-price "]', '.product-price',
  // Names: …-name classes, but a category's name is a word to translate.
  '[class$="-name"]:not([class*="cat-name"])', '[class*="-name "]:not([class*="cat-name"])',
  // Chat messages: in the messenger, the chat dock, help-desk cases, the admin team chat.
  '.msgr-bubble-text', '.cd-msg > p', '.sc-message > p', '.tc-bubble',
].join(',');

const mark = (el) => {
  if (el.getAttribute('translate') === 'no') return;
  el.setAttribute('translate', 'no');
  el.classList.add('notranslate');
};

const markIn = (node) => {
  if (node.nodeType !== 1) return;
  if (node.matches(KEEP)) mark(node);
  node.querySelectorAll(KEEP).forEach(mark);
};

let started = false;

/** Mark what is on the page now, and what is added to it later. */
export function keepOriginalText(root = document.body) {
  if (started || typeof MutationObserver === 'undefined' || !root) return;
  started = true;
  markIn(root);
  new MutationObserver((changes) => {
    for (const change of changes) {
      if (change.type === 'childList') change.addedNodes.forEach(markIn);
      else if (change.type === 'attributes' && change.target.nodeType === 1 && change.target.matches(KEEP)) mark(change.target);
    }
  }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}
