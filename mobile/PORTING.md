# Porting the website's phone view to the app

The goal: each app screen looks and works like the same page on the website
at phone size (390 px wide), pixel for pixel where React Native allows.

## The source of truth

- `web/` is the reference and is **not edited** while porting.
- For a screen, read the web page (`web/src/pages/<Page>.jsx`), every
  component it renders, and **all** CSS that applies on phones: the page's
  own `.css`, `web/src/styles/phone-app.css`, `web/src/index.css`, and the
  `@media (max-width: 768px)` blocks. Phone styles often live late in a file.
- Weights on phones: the website's build lowers bold (600+) text to 500 on
  phones for buyer pages (`phoneMediumWeights` in `web/vite.config.js`), and
  page/section titles are 500. Match what the browser shows, not the CSS
  you first read: compare screenshots.

## The screenshots: what each screen must look like

`screenshot/` (repo root) holds a full-page phone screenshot (390 × 844 at 2×)
of every website page, by who is viewing:

- `screenshot/guest/`, `screenshot/buyer/`, `screenshot/seller/`, `screenshot/admin/`
- the file name is the page's address: `/profile/orders` → `buyer/profile_orders.png`,
  `/seller/store/about` → `seller/seller_store_about.png`, `/` → `home.png`.

Before building a screen, Read its screenshot(s) with the Read tool: that is the
target, top to bottom (the whole page, not just the first screen). Every page
in `screenshot/` must exist in the app. Then use the live comparison below to
match it exactly, since the live page also shows states the screenshot can't
(sheets, typing, empty and full lists). Retake them with
`node mobile/tools/web-screens.cjs [guest|buyer|seller|admin]`.

## Design system (mobile/src/theme)

- Tokens are the website's: `t.primary[600]` is `var(--t-primary-600)`,
  `t.neutral[150]` is `var(--t-neutral-150)`, `surface.page`, `text.muted`,
  `border.default`. Never invent a colour.
- Font: DM Sans. Use `font(weight)` from the theme for a weight
  (`...font(500)`), and give `fontSize`/`lineHeight` in px as on the website.
- Icons: `phosphor-react-native` (the website uses `@phosphor-icons/react`;
  same names with an `Icon` suffix, e.g. `HouseIcon`). Same weight (`fill`,
  `bold`, `regular`) and size as the website.
- Shared pieces live in `mobile/src/components/`. Reuse them. If a screen needs
  something another screen will also need, make it a component in its own
  new file under `src/components/` (a name no one else uses).

## Routes mirror the website's paths

| Website | App file |
|---|---|
| `/` | `app/(tabs)/index.js` |
| `/search` (search page) | `app/search.js` |
| `/products?search=…` (results) | `app/(tabs)/products.js` |
| `/search/image` | `app/search-by-image.js` |
| `/product/:slug` | `app/product/[slug].js` |
| `/product/:slug/reviews` | `app/product/[slug]/reviews.js` → make `app/product/[slug]/index.js` |
| `/store/:slug` | `app/store/[slug].js` |
| `/stores` | `app/stores.js` |
| `/today` | `app/today.js` |
| `/cart` | `app/(tabs)/cart.js` |
| `/checkout` | `app/checkout.js` |
| `/profile` | `app/(tabs)/profile.js` |
| `/profile/orders` (My Purchase) | `app/(tabs)/orders.js` |
| `/orders/:id/receipt` | `app/receipt/[id].js` |
| `/profile/returns`, `/profile/returns/:id`, `/profile/returns/request` | `app/returns/index.js`, `app/returns/[id].js`, `app/returns/request.js` |
| `/profile/addresses` | `app/addresses.js` |
| `/profile/wishlist`, `/wishlist` | `app/wishlist.js` |
| `/profile/followed-stores` | `app/followed-stores.js` |
| `/profile/reviews` | `app/reviews.js` |
| `/profile/settings` | `app/settings.js` (+ `app/edit-profile.js`) |
| `/profile/verification` | `app/verification.js` |
| `/profile/support` | `app/support.js` |
| `/profile/reports` | `app/reports.js` |
| `/help` | `app/help-center.js` |
| `/messages` | `app/(tabs)/messages.js` + `app/conversation/[id].js` |
| `/notifications`, `/notifications/:id` | `app/(tabs)/notifications.js`, `app/notification/[id].js` |
| `/login`, `/seller/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` | `app/(auth)/*` |
| `/u/:id` | `app/u/[id].js` |
| `/municipality/:id`, `/municipality/:id/gallery` | `app/municipality/[id]/index.js`, `gallery.js` |
| `/about`, `/privacy`, `/terms`, `/cookies`, `/customer-care`, `/feedback` | `app/about.js` … `app/feedback.js` |
| `/seller/apply`, `/seller/welcome` | `app/seller-apply.js`, `app/seller/welcome.js` |
| `/seller/*` (Seller Center) | `app/seller/*` (one file per website page, same sub-paths) |

Sign-in-only paths are listed in `PROTECTED_PATHS` in `app/_layout.js`.

## Data and API

- Call the backend with `apiClient` (`src/api/client.js`):
  `const res = await apiClient.get('/today', { params })`. The website's axios
  returns the body; here `res.data` is the payload as on the website
  (`res.data` / `res.pagination`). Use the same endpoints and params the web
  page uses. Do not edit `src/api/endpoints.js` (shared); call paths directly.
- Images: `resolveImg` from `src/lib/media.js`.

## Checking a screen

1. Keep the Expo web build running: in `mobile/`,
   `npx expo start --web --port 8081` (it is usually already running).
2. Compare with the website (backend + site on :3000):

   ```
   MSYS_NO_PATHCONV=1 node mobile/tools/compare.cjs <name> <webPath> <appPath> [--as buyer|seller|guest] [--scroll 600] [--full]
   ```

   It writes `mobile/tools/shots/<name>.png`, website left, app right, both
   signed in as the same throwaway user (deleted afterwards). Open it with the
   Read tool and fix every difference you can see: layout, spacing, sizes,
   colours, weights, radii, icons, texts. Repeat until they match. Use
   `--scroll` and `--full` for long pages.
3. The app must also run on Android/iOS: no web-only APIs (`window`,
   `document`, CSS strings) in screens. Use `Platform.OS` guards if needed.

## Rules for parallel work

- Edit only the files your task owns (listed in your task). Create new files
  freely with names specific to your screen.
- Do not edit `src/theme/index.js`, `app/_layout.js`, `app/(tabs)/_layout.js`
  or another task's files; note needed changes in your report instead.
- Never commit, push or `git stash`.
- Test data you create in the database must be deleted before you finish.
