# E-MOORM Mobile — Build Phases Guide (Updated)

**Scope:** Port the full **web application** (`web/`) to React Native + Expo SDK 57, consuming the existing Express/Prisma backend (`backend/`), aiming for **feature parity with `web/` for buyer + seller flows**. Admin / Municipal Admin stays web-only (desk-bound moderation work — low value on mobile).

> **🚫 Standing rule — DO NOT TOUCH `web/`:** `web/` is the **single source of truth** for UI/UX, fields, endpoints, and system flow. It is **100% complete and frozen**. Do **not** alter, refactor, or restyle anything in `web/` while building mobile. Before building any mobile screen, **read the matching `web/src/pages/*.jsx` + `.css`** and any `web/src/components/**` it composes — port behavior verbatim, never redesign from memory.

> **📖 Standing rule (Expo docs):** Expo APIs change fast — before writing code in any phase, check the **versioned docs at https://docs.expo.dev/versions/v57.0.0/** for the exact API surface.

> **🏗 Elegant UI guideline (active):** Keep the current mobile UI language — slightly darker app background (`bgPrimary: #f3f4f6`) so **white cards/headers stand out without drop shadows**, **borderless** components (spacing + background contrast instead of 1px borders/outlines/divider lines), **rounded corners**, and **safe-area-aware** headers + bottom tab bar.

Each phase ends with a **working, runnable app increment** — never leave the app broken between phases.

---

## 🔁 Page-by-page status map (web → mobile)

The gold standard. Every row below must eventually exist on mobile. Track progress here.

| Web page | Mobile route | Status |
|---|---|---|
| `Login.jsx` | `app/(auth)/login.js` | ✅ Done |
| `Register.jsx` | `app/(auth)/register.js` | ✅ Done |
| `ForgotPassword.jsx` | `app/(auth)/forgot-password.js` | ✅ Done |
| `ResetPassword.jsx` | `app/(auth)/reset-password.js` | ✅ Done |
| `Home.jsx` | `app/(tabs)/index.js` | ✅ Done |
| `Products.jsx` | `app/(tabs)/products.js` | ✅ Done |
| `ProductDetails.jsx` | `app/product/[slug].js` | ✅ Done |
| `Stores.jsx` | `app/stores.js` | ✅ Done |
| `StoreDetail.jsx` | `app/store/[slug].js` | ✅ Done |
| `SearchByImage.jsx` | `app/search-by-image.js` | ✅ Done |
| `Cart.jsx` | `app/(tabs)/cart.js` | ✅ Done |
| `Checkout.jsx` | `app/checkout.js` | ✅ Done |
| `Orders.jsx` | `app/(tabs)/orders.js` | ✅ Done |
| `OrderReceipt.jsx` | Integrated native details + receipt sharing | ✅ Done |
| `Notifications.jsx` | `app/(tabs)/notifications.js` | ✅ Done |
| `Messages.jsx` / `ProfileMessages.jsx` / `Messenger` | `app/(tabs)/messages.js` + `app/conversation/[id].js` | ✅ Done |
| `Profile.jsx` | `app/(tabs)/profile.js` | ✅ Done |
| `ProfileReviews.jsx` | `app/reviews.js` | ✅ Done |
| `ProfileSettings.jsx` | `app/settings.js` | ✅ Done |
| `Addresses.jsx` | `app/addresses.js` | ✅ Done |
| `Wishlist.jsx` | `app/wishlist.js` | ✅ Done |
| `ProfileFollowedStores.jsx` | `app/followed-stores.js` | ✅ Done |
| `HelpCenter.jsx` | `app/help-center.js` | ✅ Done |
| `Sell.jsx` | — | 🚫 Drop (buyers apply on web) |
| `SellerApply.jsx` | `app/seller-apply.js` | ✅ Done |
| `SellerDashboard.jsx` + all `Seller*` pages | `app/seller.js` segmented Seller Center | ✅ Done |
| `Admin*.jsx`, `MunicipalAdminAnalytics.jsx` | — | 🚫 Out of scope (web-only) |

---

## Phase 0 — Foundations & Tooling ✅ DONE
- Expo Router (file-based), deps installed, `axios` client + JWT interceptor, `zustand` stores (auth/cart), AsyncStorage persistence, theme tokens ported from web, toast lib, `resolveImg` media helper.

## Phase 1 — Navigation Shell & Design System ✅ DONE
- Root layout via `Stack.Protected`; buyer bottom tabs (Home/Cart/Messages/Notifications/Profile); shared UI kit (`Button`, `TextField`, `Select`, `ProductCard`, `StatusBadge`, `EmptyState`, `LoadingSkeleton`, `StarRating`); design-system demo screen.

## Phase 2 — Authentication ✅ DONE
- Login/Register/Forgot/Reset; role-aware MFA rejection for admins; hydrate session on boot; global 401→logout.

## Phase 3 — Buyer Core Browsing ✅ DONE
**Goal:** Full parity with `Home.jsx`, `Products.jsx`, `ProductDetails.jsx`, `Stores.jsx`, `StoreDetail.jsx`, `SearchByImage.jsx`.

**Done:** Home, Products listing (search/filter/sort/infinite scroll), Product Details (gallery/quantity/cart/buy-now/store/reviews/shelves), Stores, Store Detail (storefront/categories/search/sort/follow/cart), Search by Image (camera/gallery + multipart results), and open/create-conversation entry points from product/store pages.

**Exit criteria:** Browse category → product list → product detail → store detail, text search, and image search all route to real results from live backend data.

## Phase 4 — Cart & Checkout ✅ DONE
**Goal:** Parity with `Cart.jsx` and `Checkout.jsx`.
- [x] **`app/(tabs)/cart.js`** — persistent cart, stock-bounded qty stepper, remove/clear confirmation, per-store grouping, shipping threshold, totals.
- [x] **`app/checkout.js`** — inline address, delivery/pickup availability, coverage checks, store-compatible payment methods, payment-proof upload (`expo-image-picker`), review, per-store `POST /orders`, success state.
- [x] Cart badge on the tab icon.

**Exit criteria:** Can complete checkout end-to-end and see the new order on the backend.

## Phase 5 — Orders & Tracking ✅ DONE
**Goal:** Parity with `Orders.jsx` + `OrderReceipt.jsx`, incl. the tab-grouping logic.
- [x] **`app/(tabs)/orders.js`** — grouped tabs, native details sheet, buyer cancellation, buy-again, seller contact.
- [x] Native receipt summary and sharing via React Native `Share`.

**Exit criteria:** Order list filters per tab; details + receipt render for every status.

## Phase 6 — Reviews & Ratings ✅ DONE
**Goal:** Parity with `ReviewModal.jsx` (incl. media upload).
- [x] Review entry on completed/delivered/picked-up order items.
- [x] Star rating, comment, up to five photos, one video, and native multipart `POST /reviews`.
- [x] Product Details renders review photos and `videoUrl` with `expo-video` controls.

**Exit criteria:** Submit a review w/ photos/video from a completed order and see it on the product page.

## Phase 7 — Profile, Addresses, Wishlist, Follow ✅ DONE
**Done:** Live profile stats, reviews, default address management, profile/password/avatar settings, persisted wishlist, followed stores with alert preferences, and Help Center.
- [x] Wire Follow/Unfollow on Store Detail (from Phase 3).

**Exit criteria:** Full profile management + follow sync between Store Detail and Followed Stores.

## Phase 8 — Notifications & Messaging ✅ DONE
**Done:** Notification list, messaging conversation list + thread.
**Remaining:**
- [x] Cart/message/notification badges on the tab bar.
- [x] Start/open conversation from product/store page (`?store=` parity with web Messenger).
- [x] Poll on focus and every 30 seconds while active.

## Phase 9 — Seller Mode ✅ DONE
**Goal:** Parity with all `Seller*` pages.
- [x] Role-aware Seller Center and seller application.
- [x] Overview and finance KPIs, low-stock alerts, products CRUD with multi-image upload.
- [x] Fulfillment-aware order status transitions and buyer/order summaries.
- [x] Store branding, hours, fulfillment, COD, and QR payment settings.
- [x] Sales analytics, best sellers, buyer reviews, and shared seller inbox.

**Exit criteria:** A seller can fully manage products + fulfill orders from mobile without the web dashboard.

## Phase 10 — Push, Offline, Polish & Store Submission
- [ ] `expo-notifications` token registration + backend device-token endpoint; push on status change/new message/follower product.
- [ ] Offline: network banners, graceful error states (retry queue = stretch).
- [ ] Deep links: `emoorm://product/:id`, `emoorm://order/:id`, universal links.
- [ ] Performance: `expo-image`, list virtualization, bundle size.
- [ ] Icons/splash, `app.json` metadata, privacy manifest, permission strings.
- [ ] EAS Build → TestFlight / Play internal.

**Completed release preparation:** product identity, deep-link scheme, Android/iOS identifiers, icons, permission descriptions, EAS build profiles, full Expo web export, and desktop/phone Playwright layout checks. Push registration and signed store builds require a backend device-token endpoint plus Expo/Apple/Google credentials.

---

## Cross-Cutting Notes
- **Backend reuse:** No new backend endpoints needed through Phase 9 except device-token registration (Phase 10) — mobile is a pure consumer of `backend/src/routes/*`.
- **Parity bugs to port (not reintroduce):**
  - Buyer order tab filtering must use status *groups* (`TAB_STATUS_GROUPS` in `Orders.jsx`), not exact match.
  - Review submission uses `multipart/form-data`; backend expects `userId` (not `buyerId`) and `user.profilePhoto` (not `avatarUrl`).
- **Image URLs:** backend returns relative `/uploads/...` — always resolve via `resolveImg` against the API host.
- **Elegant UI:** keep borderless + shadow-free styling; darker `bgPrimary` (#f3f4f6) so white cards stand out; safe-area-aware headers + tabs.
- **Testing order:** after each phase, smoke-test on Android emulator + a physical device (camera/upload behave differently).

