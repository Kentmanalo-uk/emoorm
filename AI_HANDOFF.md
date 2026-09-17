# AI Handoff: E-MOORM

**Inspection date:** 2026-09-16
**Purpose:** Concise development context for Claude Code. This document reflects the current source tree; older status documents may be stale.

## 1. Project Overview

**Project name:** E-MOORM / Emoorm

**Purpose:** Hyperlocal e-commerce marketplace for buyers, farmers, fishers, artisans, cooperatives, MSMEs, and local sellers in Oriental Mindoro, Philippines.

**Main features:**
- Product and store browsing, text search, perceptual image search, categories, municipalities, and store discovery.
- Buyer cart, per-store checkout, delivery or pickup, vouchers, payment references/proof, orders, reviews, wishlist, follows, returns, support, notifications, and buyer-store messaging.
- Seller application, KYC upload, store/product/inventory/order/return/analytics management.
- Municipal and Superadmin moderation, banners, vouchers, announcements, analytics, audit logs, and global app branding.
- Web and Expo mobile clients sharing one REST API.

**Current stack:**
- Backend: Node.js, Express 5, CommonJS JavaScript, Prisma 5.22, MySQL/MariaDB.
- Web: React 19, Vite 8, JavaScript/JSX, React Router, Zustand, TanStack Query, Axios, Phosphor icons, Leaflet.
- Mobile: React Native 0.86, Expo SDK 57, Expo Router, JavaScript, Zustand, Axios, AsyncStorage.
- Auth: JWT access/refresh tokens, bcrypt, Google OAuth flow, TOTP/MFA, QR login.

**Important folders:**
- `backend/`: REST API, Prisma schema/migrations, uploads, seed and test scripts.
- `web/`: React/Vite client, pages, shared components, stores, hooks, styles, public assets.
- `mobile/`: Expo Router app, mobile screens/components/stores/theme.
- Root Markdown files: context, status, setup, test, and feature notes. Some are historical and must be checked against source.

## 2. Current System State

### Working / implemented
- Backend route/controller/service/repository structure is active and mounted from `backend/src/routes/index.js`.
- Prisma schema currently contains 30 model declarations, including users, municipalities, stores, products, orders, reviews, returns, messaging, notifications, support, banners, vouchers, audit logs, and `AppSetting`.
- Database migration for `app_settings` was applied successfully. It stores the global app logo and product-image placeholder.
- Web production builds pass with no compile errors.
- Public `GET /api/app-settings` works; unauthenticated branding writes return `401`; Superadmin writes are protected by `authorize('SUPER_ADMIN')`.
- Global branding editor exists in Superadmin Settings. It updates the general logo and the no-product-image placeholder and is consumed by shared web branding/product components.
- Product cards and major homepage layout adjustments are implemented: homepage product grid is 6 columns on desktop; catalog/search is 5 columns on desktop; headings and municipality logos were enlarged; placeholder logos are centered, large, and faded; Explore Products uses dim white.
- Sell page guest dropdowns match the buyer account-dropdown style. Sell-page auth redirects preserve the seller application destination; existing `SELLER` accounts go to `/seller`.
- Saved-account functionality was removed: no saved-account login card, cache switching, Saved Accounts page, or account-token cache remains. Legacy `emoorm-cached-accounts` local storage is cleared on auth-store load.
- Image search uses the shared Products results page and backend perceptual image matching (`POST /api/products/search-by-image`); clipboard paste is supported.
- Mobile UI work already completed in source includes safe-area headers/tab bar, borderless visual treatment, and cart item/store selection for checkout.

### Partial / needs verification
- Mobile Phase 10 items in `mobile/CLAUDE.md`/related docs: push-token registration, offline behavior, deep-link finalization, performance work, and signed production builds are not fully verified.
- Municipality/ownership authorization exists, but every protected endpoint has not been systematically audited.
- Email delivery, push delivery, Google OAuth configuration, Cloudinary usage, and external payment-provider integration are not fully verified from source/runtime.
- Full web responsive testing across desktop/tablet/mobile is not complete.
- Messaging real-time behavior and polling/WebSocket details need verification.
- Full end-to-end regression coverage is limited; backend package `test` script is a placeholder.

### Current runtime notes
- Default backend URL is `http://localhost:3000/api`; Vite default is `http://localhost:5173`.
- The backend has been run successfully against the configured database in recent work. A previous Prisma/Express timeout note exists in old documentation; treat it as historical until reproduced.
- Vite build warning: the main JavaScript chunk is about 1.3 MB, above the 500 kB warning threshold. This is a performance warning, not a build failure.

## 3. Current UI/UX State

### Web rules and conventions
- Preserve existing desktop layouts unless the request explicitly changes them.
- Reuse existing layout, card, button, form, icon, `ProductImage`, `AppLogo`, and auth patterns.
- Current visual language is green marketplace UI with white/dim-white sections, restrained borders/shadows, compact controls, and Phosphor icons.
- Homepage product cards use `.products-section .products-grid`; search/catalog cards use `.products-page .products-grid`. Keep these selectors scoped because CSS files are globally imported.
- App branding must use `AppLogo`; unavailable product images must use `ProductImage`/the configured placeholder rather than hardcoded page-specific logos.
- Uploaded media generally uses `/uploads/...` and must be resolved through `web/src/lib/media.js`; public static assets such as `/brand-icon.png` stay on the web origin.
- Buyer Header, Sell header, AdminLayout, SellerLayout, auth pages, and product cards are established screens. Do not redesign them unnecessarily.

### Responsive behavior
- Web layouts use responsive CSS with mobile breakpoints around 768px and narrower 480px rules; verify changes on phone widths.
- Homepage: 6 product columns desktop, 4 tablet, 2 mobile. Search/catalog: 5 desktop, 4 tablet, 2 mobile.
- Municipality logos are a horizontally scrolling rail on narrow screens.
- Mobile app uses Expo Router, safe-area-aware headers, a five-tab navigation (Home, Cart, Messages, Notifications, Profile), light gray background, white borderless cards, spacing instead of dividers, and Phosphor icons.
- Do not assume root docs are current: `APP_CONTEXT.md` contains old TypeScript/Tailwind claims while the active web/backend code is JavaScript and uses the current package scripts.

## 4. Backend / Database

### Architecture
Request flow is generally:
`route -> controller -> service -> repository -> Prisma -> MySQL`

`backend/server.js` starts the server and database connection. `backend/src/app.js` configures Express middleware, static uploads, CORS, error handling, and `/api` routing. Responses normally use `{ success, message, data }`.

### Important models
- `User`: identity, role, municipality, active/deleted state, seller application/KYC fields, MFA fields, and relations to stores/orders/cart/wishlist/messages/notifications.
- `Municipality`: name/code, logo, showcase fields, assigned admin, and municipality-owned users/stores/products.
- `Store`: one owner per seller, municipality, products/orders, fulfillment mode, pickup details, payment settings, status, and location.
- `Product`: store/category/municipality ownership, JSON images/variations, price/stock, image hash, approval status, reviews/orders.
- `Order` and `OrderItem`: per-store orders, snapshots, totals/discounts, delivery or pickup, payment method/status/reference/proof, and lifecycle status.
- `Review`, `ReturnRequest`, `Conversation`, `Message`, `Notification`, `Address`, `Voucher`, `VoucherRedemption`, `Banner`, `AuditLog`, `SupportTicket`, `InventoryMovement`, `QrLoginSession`, `PushToken`.
- `AppSetting`: singleton row with `appLogo` and `productPlaceholder`; defaults are `/brand-icon.png`.

### API structure
Feature route modules are mounted in `backend/src/routes/index.js`, including:
`/auth`, `/municipalities`, `/categories`, `/stores`, `/products`, `/orders`, `/reviews`, `/reports`, `/notifications`, `/upload`, `/analytics`, `/audit-logs`, `/announcements`, `/admin`, `/auth/mfa`, `/auth/qr`, `/messages`, `/follows`, `/addresses`, `/returns`, `/support`, `/banners`, `/vouchers`, and `/app-settings`.

Public health endpoint: `GET /api/health`.
Public branding read: `GET /api/app-settings`.
Superadmin branding write: `PUT /api/app-settings`.

### Auth flow
- Login/register return access and refresh tokens.
- Web Axios adds the access token and attempts refresh on `401`.
- `authenticate` verifies JWT, checks active/deleted users, and attaches a limited user object to `req.user`.
- `authorize(...roles)` enforces role access.
- `checkMunicipalityAccess()` supports municipality scoping; endpoint-by-endpoint coverage still needs an audit.
- KYC files use the private upload directory and authenticated retrieval; ordinary product/media uploads use public `backend/uploads`.

### Configuration names (no values)
- Server: `NODE_ENV`, `PORT`, `API_PREFIX`.
- Database/auth: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN`, `BCRYPT_ROUNDS`.
- CORS/client: `CORS_ORIGIN`, `ALLOWED_ORIGINS`, `FRONTEND_URL`.
- Uploads: `MAX_FILE_SIZE`, `UPLOAD_DIR`, `PRIVATE_UPLOAD_DIR`, `ALLOWED_FILE_TYPES`.
- Integrations: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- Limits: `DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`, `BODY_LIMIT`.

Never put values from `.env` in this document or in commits.

## 5. User Roles & Permissions

- **Guest:** Browse public products/stores/municipalities, search, view details, register, and log in. Cannot purchase, message, review, or sell.
- **Buyer:** Default registered role. Can manage profile/addresses, wishlist/cart, checkout, delivery/pickup orders, reviews, reports, follows, messaging, notifications, support, and seller application.
- **Seller:** A buyer promoted after seller approval. Owns one store and can manage products/inventory/store settings, fulfill orders, manage returns, configure payment/fulfillment, message buyers, and view analytics/finance. Seller routes require `SELLER` authorization and ownership checks.
- **Municipal Admin / Junior Admin:** Assigned to exactly one municipality. Can moderate scoped seller applications, products, sellers, reports, and analytics. Must not access another municipality; backend authorization is the source of truth.
- **Superadmin:** Platform-wide user/role management, all municipalities, categories, products, seller applications, reports, banners, vouchers, announcements, audit logs, analytics, and global app settings/branding.

There is no generic buyer/seller mode toggle. A user starts as `BUYER`; approved seller applications change the backend role to `SELLER`. `SellerApply` redirects existing sellers to `/seller`, and Sell-page redirects prioritize the seller role.

## 6. Important Existing Workflows

- **Registration/login:** Web and mobile call auth endpoints; tokens are stored in their respective client auth stores. Web supports password login, Google flow, MFA/TOTP, and QR login. Login redirect query paths are preserved for safe internal paths; seller role takes priority and goes to `/seller`.
- **Seller application:** Authenticated buyer submits shop details and KYC through `/seller/apply`; application becomes pending; municipal/Superadmin reviews it; approval promotes the user to `SELLER`; seller can then create/manage the store.
- **Product creation:** Seller submits product data and images; backend stores public image paths and starts products in a pending approval state; admin approval makes products buyer-visible.
- **Browsing/search:** Public product/store/category/municipality APIs feed Home, Products, StoreDetail, and municipality pages. Text and image search use normal product cards/results.
- **Cart/checkout:** Cart is grouped per store. Selected item/store checkboxes determine checkout; checkout creates per-store orders and removes purchased items only.
- **Payment:** Supported methods include COD, GCash, QRPH, and bank transfer. Reference/proof fields and uploads exist; automated provider settlement/verification is UNKNOWN.
- **Orders:** Buyers create and track orders; sellers confirm, prepare, mark ready, ship/deliver or prepare pickup; status history and cancellation/return logic exist.
- **Delivery/pickup:** Store fulfillment settings control delivery, pickup, or both. Orders carry address/contact data for delivery and pickup location/instructions where applicable.
- **Admin:** Admin routes/pages cover dashboards, users, sellers, products, reports, orders, categories, municipalities, analytics, announcements, banners, vouchers, audit logs, and settings.
- **Municipalities:** Users, stores, products, reports, service areas, municipal logos, and showcase data are municipality-linked; municipal admin access is intended to remain scoped.
- **Global branding:** Superadmin Settings uploads and publishes the general app logo and product placeholder through `AppSetting`; web consumers use `AppLogo` and `ProductImage` with static fallback support.

## 7. Remaining Tasks

### Critical
- `[~]` Audit every protected backend route for role, ownership, and municipality enforcement; add focused cross-municipality tests where coverage is missing.
- `[~]` Run a full live smoke test through MySQL -> Express -> Web for auth, seller approval, product approval, cart/checkout, payment proof, order transitions, returns, messaging, and admin moderation.
- `[ ]` Confirm production CORS, JWT, database, upload, and integration configuration without exposing secrets.

### Important
- `[~]` Complete mobile Phase 10 verification: push-token registration, offline handling, deep linking, performance, and signed builds.
- `[ ]` Verify or complete SMTP/password-reset delivery, Google OAuth configuration, push notification delivery, and external payment verification.
- `[ ]` Verify municipality showcase/admin behavior and endpoint parity across web and mobile.
- `[ ]` Add or improve automated regression tests; the backend `npm test` script is currently a placeholder.

### Minor / Polish
- `[ ]` Reduce the web production bundle-size warning through route-level code splitting or an intentional Vite warning limit.
- `[ ]` Reconcile stale documentation, especially `APP_CONTEXT.md`, older backend status/API docs, and any port/model counts that no longer match source.
- `[ ]` Complete responsive visual checks for all high-traffic web screens.
- `[ ]` Review outdated root backend test scripts and remove or update them only after confirming they are unused.

## 8. Known Issues / Bugs

- **CORS host mismatch:** Backend defaults allow `http://localhost:5173`, while using `http://127.0.0.1:5173` can produce CORS failures for API calls. Use the configured host consistently or add the required origin to `ALLOWED_ORIGINS`.
- **Large web bundle:** `npm run build` succeeds but warns about a roughly 1.3 MB minified chunk. No runtime failure is implied.
- **Stale documentation:** Several older Markdown files describe earlier package versions, TypeScript, fewer models, or port 5000. Source/package scripts are authoritative.
- **Backend Prisma timeout note:** Older docs report Express/Prisma HTTP timeouts on Windows/Laragon while direct scripts worked. Recent API logs show successful requests, so status is currently UNKNOWN and should be reproduced before changing connection code.
- **External integrations:** Live email, Google OAuth, Cloudinary, push, and payment-provider verification are UNKNOWN unless tested with configured credentials.
- **Authorization coverage:** Middleware exists, but a complete endpoint-by-endpoint scope audit has not been completed.
- **No broad visual regression suite:** Responsive behavior and all workflows are not covered by automated browser tests.

## 9. Recent Changes

Chronological summary from the latest development work:

1. Homepage product grids were scoped so Home is 6 columns on desktop and Products/search is 5; responsive fallbacks remain 4/2.
2. Homepage section headings were enlarged and set to normal weight; municipality logos were enlarged.
3. Product-image fallback behavior was corrected so the configurable Emoorm placeholder is centered, large, contained, and faded; Explore Products received a dim-white background.
4. Superadmin global branding was added: `AppSetting` schema/migration, secured API, settings UI, `AppLogo`, and dynamic `ProductImage` placeholder.
5. Sell-page guest dropdowns were restyled to match the buyer account dropdown, and Sell-page login/signup redirects were updated so sellers go to `/seller` and non-sellers go to `/seller/apply`.
6. Saved-account functionality was removed from the login UI and auth store; legacy local storage is cleared.
7. Buyer identity verification added (2026-09-16): `IdentityVerification` model/migration, `/api/identity-verification` (GET status, POST OCR submission), server-side OCR with `tesseract.js` (in-memory images only), encrypted extracted fields, HMAC ID-number hash, audit-logged attempts, backend checkout gate in `order.service.createOrder`, web page `/profile/verification`, and Buy Now/Cart/Checkout prompts. Tests: `npm run test:identity`. Mobile has no verification screen yet, so unverified mobile buyers are blocked at checkout.
8. Municipal Admin scope fixed for `GET /reports/:id`, `GET /returns/:id`, and `DELETE /reviews/:id`, with tests in `test-municipal-admin-scope.js`.

## 10. Important Files

### Backend
- `backend/server.js`: startup, Prisma connection, server lifecycle.
- `backend/src/app.js`: Express middleware and app setup.
- `backend/src/routes/index.js`: all API route mounts.
- `backend/src/middleware/auth.js`: JWT authentication, role checks, municipality/store ownership checks.
- `backend/src/config/env.js`: environment names and defaults.
- `backend/src/config/database.js`: shared Prisma client.
- `backend/prisma/schema.prisma`: current database contract.
- `backend/prisma/migrations/`: applied schema history, including `add_app_settings`.
- `backend/src/controllers/`, `services/`, `repositories/`: feature implementation layers.
- `backend/src/services/appSetting.service.js` and `backend/src/routes/appSetting.routes.js`: global branding API.
- `backend/src/routes/upload.routes.js` and `backend/src/middleware/upload.js`: public/KYC upload behavior.

### Web
- `web/src/App.jsx`: route tree and QueryClient provider.
- `web/src/lib/axios.js`: API base URL, auth header, refresh/error interceptor.
- `web/src/lib/media.js`: backend upload URL resolution.
- `web/src/store/authStore.js`: auth state and token lifecycle.
- `web/src/pages/Home.jsx` / `Home.css`: homepage layout and grids.
- `web/src/pages/Products.jsx` / `Products.css`: catalog/search results.
- `web/src/pages/Login.jsx`, `Register.jsx`, `SellerApply.jsx`: authentication/onboarding redirects.
- `web/src/pages/Sell.jsx` / `Sell.css`: seller marketing page and guest dropdowns.
- `web/src/pages/AdminSettings.jsx` / `AdminSettings.css`: Superadmin branding controls plus profile/security settings.
- `web/src/components/AppLogo.jsx`: dynamic general app logo.
- `web/src/components/ProductImage.jsx` / `ProductImage.css`: product image and configurable fallback.
- `web/src/components/layout/Header.jsx`: buyer header/account dropdown.
- `web/src/components/admin/AdminLayout.jsx`: admin shell/navigation.
- `web/src/components/layout/SellerLayout.jsx`: seller shell/navigation.

### Mobile
- `mobile/app/_layout.js`: Expo root and navigation.
- `mobile/app/(tabs)/`: buyer tab screens.
- `mobile/app/(auth)/`: mobile authentication screens.
- `mobile/src/store/`: mobile auth/cart/messaging state.
- `mobile/src/theme/`: mobile design tokens.
- `mobile/CLAUDE.md` and `mobile/AGENTS.md`: mobile-specific instructions and phase notes.

## 11. Development Commands

Run each command from its application directory.

### Web
```powershell
Set-Location web
npm install
npm run dev
npm run build
npm run preview
npm run lint
```

### Backend
```powershell
Set-Location backend
npm install
npm run dev
npm start
npm run seed
npm run test:municipal-scope
```

### Prisma / database
```powershell
Set-Location backend
npx prisma generate
npx prisma migrate deploy
npx prisma migrate dev --name <migration-name>
npx prisma db seed
npx prisma studio
```

Do not run `prisma migrate reset` unless data loss is explicitly approved.

### Mobile
```powershell
Set-Location mobile
npm install
npm start
npm run android
npm run ios
npm run web
```

The backend normally listens on port 3000, the web dev server on 5173, and MySQL is normally on 3306 through Laragon. Confirm ports and CORS before testing.

## 12. AI Development Rules

- Do not unnecessarily rewrite working functionality or redesign established screens.
- Inspect current source before editing; older Markdown status files may be stale.
- Keep changes focused on the requested behavior and preserve public APIs where possible.
- Reuse existing components, route patterns, services, stores, CSS conventions, and upload helpers.
- Check authorization, ownership, and municipality scope before adding protected actions or routes.
- Never expose secrets, tokens, passwords, private KYC paths, or `.env` values.
- Do not add frameworks or dependencies when existing project patterns solve the problem.
- Preserve desktop UI unless specifically asked to change it; test responsive behavior for mobile web.
- Use the shared `AppLogo` and `ProductImage` for global branding/media fallbacks.
- Validate focused behavior first, then run the narrowest build/test available.
- Do not discard unrelated user changes or reset the database/worktree.
- Mark uncertain behavior as `UNKNOWN` and verify it before making architectural changes.

## 13. CURRENT PRIORITY

**Objective:** Complete authorization/municipality-scope auditing and live end-to-end verification of the existing marketplace flows.

**Current progress:** Core web/backend/mobile flows and role middleware exist; recent API logs show the backend serving requests, and web production builds pass. Seller, buyer, admin, branding, cart, order, and municipality features have been implemented incrementally.

**What remains:** Check every protected route for correct role/ownership/municipality enforcement, then run smoke tests for registration/login, seller application/approval, product approval, cart/checkout, payment proof, delivery/pickup order transitions, returns, messaging, notifications, and admin actions. Reproduce any old Prisma timeout only if it still occurs.

**Relevant files:** `backend/src/middleware/auth.js`, `backend/src/routes/`, `backend/src/controllers/`, `backend/src/services/`, `backend/test-*.js`, `backend/test-municipal-admin-scope.js`, `web/src/App.jsx`, `web/src/store/authStore.js`, and the workflow pages listed above.

**Constraints:** Do not weaken authorization to make tests pass; do not use production secrets or reset data; preserve current UI unless a test exposes a real defect; update stale docs only after source verification.

## 14. Handoff Notes

- The working tree was clean at handoff inspection; do not assume that means future changes are safe to overwrite.
- The active code is JavaScript/CommonJS on the backend and JavaScript/JSX on web/mobile; references to TypeScript in older docs are not authoritative.
- `AppSetting` migration is already applied in the inspected database. New environments must run migrations before using `/api/app-settings`.
- Use `localhost` consistently for local browser/API testing unless CORS is explicitly updated for `127.0.0.1`.
- The last completed user-requested change was removal of saved accounts. There is no active feature edit in progress beyond this handoff document.
