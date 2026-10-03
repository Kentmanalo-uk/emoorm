# Mobile Header & Bottom Nav UI Improvements

## Plan

1. **`mobile/app/(tabs)/messages.js`** — Rebuild header: safe-area top inset, larger padding (horizontal `xl`, bottom `lg`), white bg + bottom border.
2. **`mobile/app/(tabs)/notifications.js`** — Same header improvements (safe-area top inset, larger padding, white bg + bottom border).
3. **`mobile/app/(tabs)/products.js`** — Add safe-area top inset to search/filter header.
4. **`mobile/app/conversation/[id].js`** — Add safe-area top inset to back-button header.
5. **`mobile/app/(tabs)/_layout.js`** — Add safe-area bottom padding to the bottom tab bar.l
## Steps

- [x] 1. Explore mobile app structure (tabs, theme, layouts)
- [x] 2. Confirm plan with user (approved + bottom nav safe area added)
- [x] 3. Update `messages.js` header (safe-area + spacing)
- [x] 4. Update `notifications.js` header (safe-area + spacing)
- [x] 5. Update `products.js` header (safe-area top inset)
- [x] 6. Update `conversation/[id].js` header (safe-area top inset)
- [x] 7. Update `(tabs)/_layout.js` bottom tab bar (safe-area bottom padding)
- [x] 8. Verify changes

# Phase 2: Remove all borders/outlines/dividers from mobile UI

## Plan
Use spacing, background colors, rounded corners instead of borders.

1. `src/components/Button.js` — remove borderWidth + borderColor; give secondary a light green tint bg.
2. `src/components/TextField.js` — remove border; use gray background; focus/error via bg color.
3. `src/components/Select.js` — remove border; use gray bg; remove sheet header + option dividers.
4. `src/components/ProductCard.js` — remove card border.
5. `app/design-system.js` — remove emptyStateBox border.
6. `app/(tabs)/messages.js` — remove header border, list item divider, unreadDot ring.
7. `app/(tabs)/notifications.js` — remove header border, item border, unread item borderColor.
8. `app/(tabs)/products.js` — remove header border, priceInput border.
9. `app/(tabs)/index.js` — remove header border.
10. `app/(tabs)/profile.js` — remove logout button border.
11. `app/conversation/[id].js` — remove header border + composer top border.

## Steps
- [x] 1. Button.js
- [x] 2. TextField.js
- [x] 3. Select.js
- [x] 4. ProductCard.js
- [x] 5. design-system.js
- [x] 6. messages.js
- [x] 7. notifications.js
- [x] 8. products.js
- [x] 9. index.js
- [x] 10. profile.js
- [x] 11. conversation/[id].js
- [x] 12. Verify build (all files inspected; no syntax errors)

# Cart: Select items / stores to checkout

## Plan
Let users check which cart items (and per-store groups) to include in checkout, so only the selected items are purchased.

## Steps
- [x] 1. `cartStore.js` — add `selectedProductIds` state + `toggleItem`, `toggleStore`, `toggleAll`, `setSelectedItems`, `removeSelectedItems`; keep `removeItem`/`clearCart` clearing selection.
- [x] 2. `(tabs)/cart.js` — add checkbox UI (item, store header, select-all), show selected count/subtotal in bottom bar, disable checkout when nothing selected.
- [x] 3. `checkout.js` — only send selected items to checkout; after order, remove only the purchased (selected) items, leaving unselected items in the cart.
- [x] 4. Verify logic & syntax across the three files.

