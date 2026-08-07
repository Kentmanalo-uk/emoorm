# E-MOORM Mobile — Build Phases Guide

Scope: React Native + Expo SDK 57 app consuming the existing Express/Prisma backend (`backend/`), aiming for feature parity with `web/` for buyer + seller flows. Admin/Municipal Admin stays web-only (desk-bound moderation work, low value on mobile).

> **Standing rule (from `AGENTS.md`):** Expo APIs change fast — before writing code in any phase, check the versioned docs at https://docs.expo.dev/versions/v57.0.0/ for the exact API surface (don't rely on memory/older SDK patterns).

> **Update (Phase 0):** Per current Expo docs, this app uses **Expo Router** (file-based routing, `app/` directory) instead of manually installing `@react-navigation/*`. Expo Router is built on React Navigation under the hood and is the officially recommended approach for new Expo apps — it provides everything the original React-Navigation-based plan below describes (stacks, tabs, auth-gated routing via `Stack.Protected`). Any mention of `@react-navigation/native` install steps or a hand-rolled `RootNavigator` below should be read as "handled by Expo Router" instead.

> **Standing rule (web-parity):** `web/` is the single source of truth for UI/UX and system flow. Before building or restyling any screen, read the corresponding real `web/src/pages/*.jsx` (+ its `.css`) and any `web/src/components/**` it composes — do not design from memory/assumption. Reuse the same field names, endpoints, and status/type maps verbatim so mobile and web never drift apart.

> **Next up:** Phase 3 remainder — Products listing (`app/(tabs)/products.js`) and Product Details (new `app/product/[id].js`), since almost every outstanding placeholder (Home's category/product taps, the header search bar) routes there next.


> **Update (bottom nav restructure, post-Phase 2):** The buyer bottom tab bar was restructured to match the web app's primary nav flow: **Home** (now absorbs product/category browsing, mirroring `web/src/pages/Home.jsx`), **Cart**, **Messages**, **Notifications**, **Profile**. The former standalone `Products` and `Orders` tabs were removed from the tab bar (`href: null` in `app/(tabs)/_layout.js`) but remain routable — Orders is reached from Profile's "My Purchase" grid (mirrors `web/src/pages/Profile.jsx`), Products browsing still needs a dedicated screen in Phase 3.

Each phase ends with a working, runnable app increment — never leave the app in a broken state between phases.

---

## Page-by-page status map (web → mobile)

The mobile app is a straight port of `web/src/pages/*` — every screen below must eventually exist here. Use this table as the source of truth for "what's left" instead of re-deriving it from the phase prose.

| Web page | Mobile route | Status |
|---|---|---|
| `Login.jsx` | `app/(auth)/login.js` | ✅ Done |
| `Register.jsx` | `app/(auth)/register.js` | ✅ Done |
| `ForgotPassword.jsx` | `app/(auth)/forgot-password.js` | ✅ Done |
| `ResetPassword.jsx` | `app/(auth)/reset-password.js` | ✅ Done |
| `Home.jsx` | `app/(tabs)/index.js` | ✅ Done (banners, categories, suggested products, header w/ logo+search) |
| `Products.jsx` | `app/(tabs)/products.js` | ⏳ Placeholder only — Phase 3 |
| `ProductDetails.jsx` | *(new route, e.g. `app/product/[id].js`)* | ⏳ Not started — Phase 3 |
| `Stores.jsx` | *(new route, e.g. `app/(tabs)/stores.js` or reached from Products)* | ⏳ Not started — Phase 3 |
| `StoreDetail.jsx` | *(new route, e.g. `app/store/[id].js`)* | ⏳ Not started — Phase 3 |
| `SearchByImage.jsx` | *(new route, e.g. `app/search-by-image.js`)* | ⏳ Not started — Phase 3 (camera icon in Home header already toasts a placeholder for this) |
| `Cart.jsx` | `app/(tabs)/cart.js` | ⏳ Placeholder only — Phase 4 |
| `Checkout.jsx` | *(new route, e.g. `app/checkout.js`)* | ⏳ Not started — Phase 4 |
| `Orders.jsx` | `app/(tabs)/orders.js` | ⏳ Placeholder only — Phase 5 (reachable from Profile, not a tab) |
| `OrderReceipt.jsx` | *(new route, e.g. `app/order/[id]/receipt.js`)* | ⏳ Not started — Phase 5 |
| `ReviewModal.jsx` (component, not a page) | *(modal/screen off Orders)* | ⏳ Not started — Phase 6 |
| `Notifications.jsx` | `app/(tabs)/notifications.js` | ✅ Done |
| `Messages.jsx` / `ProfileMessages.jsx` | `app/(tabs)/messages.js` + `app/conversation/[id].js` | ✅ Done |
| `Profile.jsx` | `app/(tabs)/profile.js` | ✅ Done (header, stats, My Purchase grid, Services shortcuts) |
| `ProfileReviews.jsx` | *(new route, e.g. `app/profile/reviews.js`)* | ⏳ Not started — Phase 7 |
| `ProfileSettings.jsx` | *(new route, e.g. `app/profile/settings.js`)* | ⏳ Not started — Phase 7 |
| `Addresses.jsx` | *(new route, e.g. `app/profile/addresses.js`)* | ⏳ Not started — Phase 7 |
| `Wishlist.jsx` | *(new route, e.g. `app/profile/wishlist.js`)* | ⏳ Not started — Phase 7 |
| `ProfileFollowedStores.jsx` | *(new route, e.g. `app/profile/followed-stores.js`)* | ⏳ Not started — Phase 7 |
| `HelpCenter.jsx` | *(new route, e.g. `app/profile/help-center.js`)* | ⏳ Not started — Phase 7 (low priority, static content) |
| `Sell.jsx` | — | ⏳ "Coming soon" toast only — Phase 9 (or drop; buyers can apply on web) |
| `SellerApply.jsx` | — | ⏳ Not started — Phase 9 |
| `SellerDashboard.jsx`, `SellerProducts.jsx`, `SellerOrders.jsx`, `SellerFulfillment.jsx`, `SellerStore.jsx`, `SellerMessages.jsx`, `SellerReviews.jsx`, `SellerAnalytics.jsx`, `SellerFinance.jsx` | *(new `(seller)` group)* | ⏳ Not started — Phase 9 |
| `Admin*.jsx`, `MunicipalAdminAnalytics.jsx` | — | 🚫 Out of scope (web-only, desk-bound moderation) |

---

## Phase 0 — Foundations & Tooling ✅ DONE

**Goal:** Project skeleton that runs on device/simulator and talks to the backend.

- Decide & install core deps:
  - Navigation: `@react-navigation/native` + `@react-navigation/native-stack` + `@react-navigation/bottom-tabs`
  - HTTP: `axios`
  - Storage: `@react-native-async-storage/async-storage` (JWT + cached user)
  - State: `zustand` (mirrors `web/src/store/authStore.js` pattern — reuse mental model, not code)
  - Icons: `lucide-react-native` (parity with web's `lucide-react`) or `@expo/vector-icons` if lucide RN has gaps
  - Env: `expo-constants` + `app.json` `extra` field (or `react-native-dotenv`) for `API_BASE_URL`
- Folder structure (mirror web's mental model, adapted to RN):
  ```
  mobile/src/
    api/          (axios instance, endpoint constants — mirror web/src/config/api.js)
    store/        (zustand stores: auth, cart)
    navigation/   (RootNavigator, AuthStack, BuyerTabs, SellerTabs)
    screens/      (one folder per feature, mirrors web/src/pages/*)
    components/   (shared UI: ProductCard, Button, Input, Badge, EmptyState, Skeleton)
    hooks/
    lib/          (resolveImg equivalent, formatters, date utils)
    theme/        (colors, spacing, typography tokens pulled from web CSS variables)
  ```
- Axios instance with base URL pointing at the local backend (`http://<LAN-IP>:3000/api` for physical device testing — `localhost` won't work on real devices), request interceptor attaching JWT from AsyncStorage, response interceptor unwrapping `{success, data, message}` like web does.
- `.env`/`app.json` config for API base URL (dev vs prod).
- Verify `expo start` boots on Android/iOS/web with a "Hello E-MOORM" screen.

**Exit criteria:** App builds, hits `GET /api/health` successfully, shows result on screen.

---

## Phase 1 — Navigation Shell & Design System ✅ DONE

**Goal:** Skeleton nav structure + reusable UI kit so every later phase just fills in screens.

- Root layout (`app/_layout.js`) uses Expo Router's `Stack.Protected` guard pattern to switch between the `(auth)` group (Login/Register/Forgot/Reset) and the `(tabs)` group + `design-system` route based on `authStore.isAuthenticated`.
- `(tabs)` (bottom tabs, buyer default): originally Home, Products/Categories, Cart, Orders, Profile — **superseded post-Phase 2** by Home, Cart, Messages, Notifications, Profile (see "bottom nav restructure" note above). Icons via `lucide-react-native`.
- Shared components (`src/components/`): `Button`, `TextField`, `ProductCard` (grid + list variants, mirrors `web/src/pages/Home.jsx` product card), `StatusBadge` (mirrors web `Orders.jsx` status/tone map), `EmptyState`, `LoadingSkeleton`, `StarRating`.
- Theme tokens (`src/theme/index.js`): colors/spacing/radius/typography ported from `web/src/styles/colors.css` / `spacing.css` (done in Phase 0).
- Toast/alert utility: `src/lib/toast.js` wraps `react-native-toast-message` with a `toast.success()/error()/info()` API mirroring `react-hot-toast` usage on web.
- Login screen has a temporary "Continue as Buyer (Dev)" button (`authStore.login()` stub) to exercise the auth-gated routing before real auth exists — replace with real login in Phase 2.

**Exit criteria:** ✅ Can navigate between placeholder tab screens; design system components render correctly in a demo screen (`/design-system`). Verified live: login → tabs → logout → back to login flow works end-to-end.

---

## Phase 2 — Authentication ✅ DONE

**Goal:** Full auth parity with `web/src/pages/Login.jsx`, `Register.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx`.

- Screens: Login, Register (role always starts as BUYER), Forgot Password, Reset Password (deep-link or code-entry flow — decide based on whether backend uses email link tokens or OTP).
- `authStore` (zustand): `login`, `register`, `logout`, `hydrate` (restore session from AsyncStorage on app boot), `isAuthenticated`, `user`.
- Persist JWT + user in AsyncStorage; hydrate on cold start before rendering navigator (splash/loading gate).
- Handle 401 responses globally → force logout + redirect to Login.
- Basic profile completion fields (municipality/barangay) if backend requires it at register.

**Implementation notes:**
- `src/api/endpoints.js`: added `ENDPOINTS.AUTH.{LOGIN,REGISTER,REFRESH_TOKEN,FORGOT_PASSWORD,RESET_PASSWORD,PROFILE}` and `ENDPOINTS.MUNICIPALITIES`.
- `src/api/client.js`: fixed a pre-existing bug (also present on web) where the refresh-token interceptor POSTed to `/auth/refresh` instead of the real route `/auth/refresh-token`. On an unrecoverable 401 (refresh fails), the interceptor now calls `authStore.getState().logout()` (via a lazy `require` to dodge the client.js ⇄ authStore.js circular import) so in-memory auth state is cleared immediately, not just AsyncStorage — this is what drives `Stack.Protected` back to `(auth)`.
- `src/store/authStore.js`: real `login(user, accessToken, refreshToken)` (persists all three to AsyncStorage) replacing the Phase 1 dev-login stub; `updateUser()` added for future profile-edit phases.
- `src/components/Select.js` (new): modal + FlatList picker, since RN has no native `<select>` — used for the Register municipality field instead of pulling in `@react-native-picker/picker` for one field.
- Login: email/password form, mirrors web's client-side validation (email regex, password ≥ 6 chars), calls `POST /auth/login`. Admin accounts (`requiresMfa`/`requiresMfaSetup` in the response) are explicitly rejected with a toast telling them to use the web app — MFA enrollment UI is out of scope for mobile (buyer/seller only).
- Register: full parity with web's field set (`fullName`, `email`, `contactNumber`, `municipalityId` via `Select`, `barangay`, `address`, `password`, `confirmPassword`), same password-strength regex as backend validator, fetches `/municipalities` on mount.
- Forgot Password: `POST /auth/forgot-password`, success state offers "Resend link".
- Reset Password: reads an optional `?token=` route param via `useLocalSearchParams` (for a future deep-link flow) and falls back to a manual token-paste field, matching web's fallback UI — `POST /auth/reset-password`.
- Fixed `app/(tabs)/profile.js` to read `user?.fullName` (the actual `User` model field) instead of a nonexistent `firstName`.

**Exit criteria:** ✅ Can register, login, log out, and reopen the app while staying logged in (verified via `hydrate()` + AsyncStorage persistence). Invalid credentials and validation errors surface as toasts/inline field errors.

---

## Phase 3 — Buyer Core Browsing 🔨 PARTIALLY DONE (Home pulled forward)

**Goal:** Parity with `Home.jsx`, `Products.jsx`, `ProductDetails.jsx`, `Stores.jsx`, `StoreDetail.jsx`.

- Home: featured products, categories shelf, "from local sellers" sections — paginated `FlatList`.
- Products listing (`app/(tabs)/products.js`, currently a placeholder): search bar (wire up the Home header's search input to route here with a `?q=` param), category filter, sort, infinite scroll (`FlatList onEndReached`).
- Product Details (new `app/product/[id].js`): image gallery (swipeable), price/stock, add-to-cart, add-to-wishlist, store mini-card, reviews list (read-only in this phase), "from the same store" shelf. All current "Product details land in Phase 3" toasts on Home should navigate here once built.
- Stores listing + Store Detail (new `app/store/[id].js`, plus a Stores entry point — likely a tab within Products or a link from Home): banner/logo, tabs (All Products / New Listings) matching the web redesign, Follow button (stub — wired in Phase 7).
- Search by Image (new `app/search-by-image.js`, mirrors `web/src/pages/SearchByImage.jsx`): camera roll/photo picker via `expo-image-picker`, `POST /products/search-by-image` (multipart), results grid reusing `ProductCard`. The Home header's camera icon currently toasts a placeholder for this.
- Image resolution helper mirroring `web/src/lib/media.js` `resolveImg` (handle relative `/uploads/...` paths against API host) — already done (`src/lib/media.js`).

**Implementation notes (done as part of the bottom-nav restructure):**
- `src/lib/media.js` (new): `resolveImg()` port of web's helper — strips the `/api` suffix off `API_BASE_URL` to build the backend origin for `/uploads/...` paths.
- `src/api/endpoints.js`: added `ENDPOINTS.CATEGORIES`, `ENDPOINTS.PRODUCTS`, `ENDPOINTS.ORDERS.MY_ORDERS`.
- `app/(tabs)/index.js` (Home) rebuilt to mirror `web/src/pages/Home.jsx`: banner carousel (auto-advancing `ScrollView` with `pagingEnabled`, using the same 3 PNGs copied into `mobile/assets/banners/`), a seller-CTA card (the web's QR "Mobile App" promo card is dropped — redundant on the app itself), a "Shop by Category" grid from `GET /categories`, and a "Suggested for You" product grid from `GET /products` reusing the existing `ProductCard` component.
- Category taps, "View all", and product taps currently show a "lands in Phase 3" toast — full Products listing and Product Details screens are still outstanding for this phase. The Home header's search bar (logo + search input + camera button, added post-Phase-2) is built and styled to match `Header.jsx`/`Header.css`, but submitting a search and tapping the camera icon are still toast placeholders pending the Products/SearchByImage screens.

**Exit criteria:** Can browse categories → product list → product detail → store detail entirely from live backend data, and search (text + image) both route to real results. *(Home + header done; Products listing, Product Details, Stores/Store Detail, Search-by-Image still outstanding.)*

---

## Phase 4 — Cart & Checkout

**Goal:** Parity with `Cart.jsx` and `Checkout.jsx`.

- Cart screen: quantity stepper, remove item, per-store grouping (if backend groups cart by store), subtotal.
- Checkout flow: address selection (reuse addresses from Phase 7 or inline-create), delivery vs pickup method, payment method selection, payment proof upload (camera/gallery via `expo-image-picker`) for GCash/manual payment methods, order summary/review step, place order.
- Cart persistence via backend cart endpoints (not local-only), so cart survives app reinstall as long as user is logged in.

**Exit criteria:** Can add items to cart, complete checkout end-to-end, and see the new order created on the backend.

---

## Phase 5 — Orders & Tracking

**Goal:** Parity with `Orders.jsx` and `OrderReceipt.jsx`, including the tab-grouping fix already applied on web.

- Orders list with the same status-tab grouping logic (All / To Pay / To Ship / Preparing / Ready / Completed / Cancelled) — port `TAB_STATUS_GROUPS` logic from web verbatim (same bug applies if omitted).
- Order details screen: item list, status timeline, cancel action (PENDING only), buy-again.
- Receipt view: read-only summary; "Save/Share" using `expo-print` (generate PDF) or `react-native-share` instead of `window.print()`.
- Push/local notification hook point placeholder for order status changes (wired fully in Phase 10).

**Exit criteria:** Order list filters correctly per tab; order detail + receipt render correctly for every status including in-transit/pickup statuses.

---

## Phase 6 — Reviews & Ratings

**Goal:** Parity with `ReviewModal.jsx` media upload feature just shipped on web.

- "Write review" entry points on completed/delivered/picked-up orders (single item → modal directly, multi-item → item picker), matching the just-fixed `Orders.jsx` behavior.
- Review form: star rating, comment, photo picker (multi, up to 5) + single video picker (`expo-image-picker` with `mediaTypes: ['images','videos']`), upload via multipart `FormData` to `POST /reviews`.
- Product detail reviews list: render `images[]` as a thumbnail grid (tap to full-screen viewer) and `videoUrl` via `expo-av` `Video` component.
- Duplicate-review (409) and validation errors surfaced as toasts, same as web.

**Exit criteria:** Can submit a review with photos/video from a completed order and see it appear on the product page.

---

## Phase 7 — Profile, Addresses, Wishlist, Follow 🔨 PARTIALLY DONE (header/purchase grid pulled forward)

**Goal:** Parity with `Profile.jsx`, `Addresses.jsx`, `ProfileSettings.jsx`, `Wishlist.jsx`, `ProfileFollowedStores.jsx`.

- Profile home: stats (orders, reviews, wishlist counts), quick links.
- My Reviews (new `app/profile/reviews.js`, mirrors `ProfileReviews.jsx`): list of the buyer's own submitted reviews, empty state links to Orders.
- Addresses CRUD (new `app/profile/addresses.js`, add/edit/delete, set default) — needed for Checkout in Phase 4, so may need to pull forward if checkout requires saved addresses.
- Settings (new `app/profile/settings.js`, mirrors `ProfileSettings.jsx`): edit profile fields, change password, avatar upload.
- Wishlist (new `app/profile/wishlist.js`): list, remove, add-to-cart from wishlist.
- Followed Stores (new `app/profile/followed-stores.js`): list with search/sort, notification toggle, unfollow — reuse `web/src/lib/follow.js` logic ported to RN (cross-tab BroadcastChannel → replace with a simple event emitter or just refetch-on-focus, since there's no multi-tab concept on mobile).
- Help Center (new `app/profile/help-center.js`, mirrors `HelpCenter.jsx`): static FAQ/topics content, low priority — do last in this phase.
- Follow/Unfollow button on Store Detail (from Phase 3) fully wired now.

**Implementation notes:**
- `app/(tabs)/profile.js` rebuilt to mirror `web/src/pages/Profile.jsx`: header card (avatar-or-initial, name, email, Following/Wishlist/Reviews stat row — currently 0 placeholders, same as web's un-wired `followedStores`/wishlist/reviews counts), a "My Purchase" 4-tile status grid (`GET /orders/my/orders`, counts by `PENDING`/`CONFIRMED`/`PREPARING`/`READY`) linking to the (still-placeholder) Orders screen, and a Services shortcut grid (Notifications/Messages jump to their tabs; Wishlist/Settings/Edit Profile show a "coming soon" toast until built).
- Followed Stores count, Wishlist count, Reviews count, Addresses, Settings, Wishlist, My Reviews, and Help Center screens are all still outstanding for this phase.

**Exit criteria:** Full profile management works; follow state syncs between Store Detail and Followed Stores list. *(Header/stats/My-Purchase grid done; My Reviews, Addresses, Settings, Wishlist, Followed Stores, Help Center still outstanding.)*

---

## Phase 8 — Notifications & Messaging 🔨 PARTIALLY DONE (pulled forward for the bottom-nav restructure)

**Goal:** Parity with `Notifications.jsx`, `Messages.jsx`/`ProfileMessages.jsx`, `Messenger` component.

- In-app notifications list (order updates, new-product-from-followed-store, promotions), unread badge on tab icon.
- Messaging: conversation list + thread view, send/receive text messages with sellers. Poll or (preferred) socket/SSE if backend supports it — check `backend/src` for a messaging transport before choosing polling vs realtime.
- Unread counts surfaced in tab bar badges.

**Implementation notes:**
- `src/api/endpoints.js`: added `ENDPOINTS.NOTIFICATIONS.{LIST,UNREAD_COUNT,MARK_READ,MARK_ALL_READ,DELETE}` and `ENDPOINTS.MESSAGES.{CONVERSATIONS,CONVERSATION,SEND,MARK_READ}` (backend routes confirmed in `backend/src/routes/notification.routes.js` and `message.routes.js` — messaging is plain REST, no socket transport exists yet, so this is poll-on-focus, not realtime).
- `app/(tabs)/notifications.js` (new, now a bottom tab): full `TYPE_CONFIG` icon/color map ported from web's `Notifications.jsx`/`Header.jsx`, `GET /notifications`, mark-one-read (tap), mark-all-read, delete, pull-to-refresh, `EmptyState` when none.
- `app/(tabs)/messages.js` (new, now a bottom tab): conversation list from `GET /messages/conversations` (store avatar/name, last message preview, unread badge, relative timestamp).
- `app/conversation/[id].js` (new, pushed from the Messages tab, registered in `app/_layout.js`'s authenticated `Stack.Protected` group): message thread — `GET /messages/conversations/:id`, bubble list (mine vs theirs via `senderId === authStore.user.id`), `POST .../messages` to send, marks the conversation read on open.
- Unread tab-bar badges are not wired yet (still outstanding for this phase).

**Exit criteria:** Buyer can see notifications and message a seller from a product/store page. *(Notifications + messaging core flow done; starting a new conversation from a product/store page still needs Phase 3's Product/Store Detail screens; tab-bar unread badges still outstanding.)*

---

## Phase 9 — Seller Mode

**Goal:** Parity with `SellerDashboard.jsx`, `SellerProducts.jsx`, `SellerOrders.jsx`, `SellerStore.jsx`, `SellerFulfillment.jsx`, `SellerReviews.jsx`, `SellerAnalytics.jsx`, `SellerFinance.jsx`.

- Role-aware navigation: sellers get an additional tab/drawer to switch into "Seller" mode (mirrors web's separate `SellerLayout`).
- Seller Dashboard: sales summary, pending-approval banner, followers card.
- Product management: list, create/edit (with multi-image upload via `expo-image-picker`), stock/status toggle.
- Order management: status-solid badges + payment-proof hover-zoom becomes tap-to-zoom on mobile (`react-native-image-viewing` or a custom modal), status transition actions, receipt printing → share/export PDF.
- Store settings: logo/cover upload, business hours, theme.
- Reviews & Analytics & Finance: read-only dashboards, charts via `react-native-svg`/`victory-native` if needed.
- `Sell.jsx`/`SellerApply.jsx` flow for buyers applying to become sellers (ID upload, shop info, status tracking).

**Exit criteria:** A seller can fully manage products and fulfill orders from the mobile app without touching the web dashboard.

---

## Phase 10 — Push Notifications, Offline Resilience, Polish & Store Submission

**Goal:** Production readiness.

- `expo-notifications` push token registration, backend endpoint to store device tokens per user, push on order status change / new message / new follower product.
- Offline handling: network-aware banners, request retry/queue for critical actions (place order, submit review) is a stretch goal — at minimum, graceful error states instead of crashes.
- Deep linking: `emoorm://product/:id`, `emoorm://order/:id` etc., and universal/app links if publishing to stores.
- Performance pass: image caching (`expo-image` instead of RN `Image`), list virtualization tuning, bundle size check.
- App icons/splash screen, `app.json` metadata, privacy manifest, permissions descriptions (camera/gallery/notifications).
- Build via EAS Build; internal testing (TestFlight / Play internal track) before public submission.

**Exit criteria:** App is installable via TestFlight/Play internal testing, handles poor network gracefully, and receives push notifications for key events.

---

## Cross-Cutting Notes

- **Backend reuse:** No new backend endpoints should be needed through Phase 9 except device-token registration in Phase 10 — the mobile app is a pure consumer of the existing `backend/src/routes/*`.
- **Parity bugs to port fixes for, not reintroduce:**
  - Buyer order tab filtering must use status *groups*, not exact match (see `TAB_STATUS_GROUPS` in `web/src/pages/Orders.jsx`).
  - Review submission requires `multipart/form-data`, backend expects `userId` (not `buyerId`) and `user.profilePhoto` (not `avatarUrl`).
- **Image URLs:** backend returns relative `/uploads/...` paths — always resolve against the API host, same as `resolveImg` on web.
- **Testing order per phase:** after each phase, manually smoke-test on both Android emulator and a physical device if possible (camera/upload flows behave differently on emulators).
