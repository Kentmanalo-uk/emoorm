# ML engine, Phase 0: audit and plan

The audit `ML_DOC.MD` asks for before any code changes (its §15 Phase 0 and
§18 steps 1-3). Nothing in the application was changed to write this. Written
10 Nov 2026.

## 1. Architecture

| Part | What it is |
|---|---|
| Backend | Node 22 (root `package.json` engines `>=22.13`), Express 5.2, Prisma 5.22 on MySQL (8.4 in CI), one process. `backend/server.js` starts the API and the background jobs; the root `server.js` is Hostinger's entry |
| Layers | route → controller (`asyncHandler`, `successResponse`) → service (`ApiError`) → repository (Prisma, raw SQL). Validators with express-validator. Mounted in `backend/src/routes/index.js` with `mount(prefix, router)` |
| Auth | `middleware/auth.js`: `authenticate`, `authorize(...roles)`, `optionalAuth`, `checkStoreOwnership`. Roles BUYER, SELLER, MUNICIPAL_ADMIN, SUPER_ADMIN; a municipal admin is scoped to their town inside services |
| Jobs | No cron (Hostinger's cron does not run on this account) and no queue. `lib/runtimeStatus.runJob(name, fn, everyMs)`: in-process timers, skip-if-running, a database lock across processes (`security_counters` `job-lock:` / `job-done:`), `/health` turns 503 when a job is late. 17 jobs today (order expiry, auto-complete, product stats hourly, backups…) |
| Settings | One `app_settings` row, a column per switch, plus JSON blocks with their own defaults (`referral_settings` + `lib/referralSettings.js`). `GET /api/app-settings` public, `PUT` super admin, cached 10 min |
| Cache | `lib/cache.js`: in-memory LRU on Hostinger (no Redis), tag invalidation, shared data only. Personal results use bounded in-memory maps (For You 60 s) |
| Web | React + Vite, `web/src`. Admin pages `Admin*.jsx`, settings cards in `components/admin/PlatformSettings.jsx`. Charts are hand-drawn SVG (`components/analytics/`), no chart library |
| App | Expo SDK 58 / React Native (`mobile/`). Buyer screens and Seller Center; no admin screens |
| Tests | `node --test backend/tests/*.test.js`, `tests/helpers.js` (refuses a database without `ci`/`test` in its name), run against `emoorm_ci_test` |

## 2. Hosting capability

| Question | Answer |
|---|---|
| Runtime | Node.js web app on Hostinger (hPanel), Node 22. No PHP or Python in the app |
| Processes / threads | Capped by the plan; the app has hit EAGAIN before (a failed start-up migration on 25 Oct). `UV_THREADPOOL_SIZE=2`, sharp on 1 thread. **No worker processes or child-process training** |
| Database | MySQL, a pool of 5 connections (`DB_CONNECTION_LIMIT`), request lanes of 24 reads / 12 writes (`middleware/overload.js`) |
| Scheduling | In-process `runJob` timers only. Hostinger cron jobs are created but never run on this account |
| Persistent process | Yes: the one Node app stays up, which is what runs the jobs |
| Disk | The app folder is replaced on every deploy. Kept files live in `emoorm-data/` outside it (uploads, backups) |
| Redis | None (`CACHE_REDIS_URL` empty) |
| Packages | npm install at build (`npm ci --omit=dev`). Native modules already working: sharp, Prisma's engine. tesseract.js (WASM) also runs |
| SSH | Not used; deploys are from GitHub with auto-deploy |

**What follows for ML:** everything runs in the existing process, in small
time-boxed `runJob` jobs (a few seconds each, batches, resumable), never
during a request. Model parameters are small JSON and go in the database,
not files: files in the app folder are wiped on deploy, and the database is
already backed up and access-controlled.

## 3. ML technology compatibility

| Need | Choice | Why |
|---|---|---|
| Similarity, search, TF-IDF, cosine | Plain JavaScript, written here | A few hundred lines; no dependency, no native code |
| Forecasting | Moving average, exponential smoothing (Holt), linear trend, plain JS | Cheap; the doc's preferred list |
| Association rules | Pair/triple counting with support, confidence, lift | With a small catalogue, counting is exact and faster than Apriori/FP-Growth |
| Segmentation | RFM scores, plain JS (k-means only if data ever justifies it) | The doc requires a deterministic fallback anyway |
| Purchase prediction | Logistic regression, plain JS gradient descent | Only once there are enough labelled outcomes (see §5) |
| Sentiment | English + Tagalog/Taglish lexicon with negation and aspect words, plain JS | No model download; Tagalog handled on purpose |
| Anomalies | Rules + z-scores / robust (median, MAD) statistics | No labelled fraud data exists |
| Image quality | sharp (already installed): resolution, brightness, contrast, Laplacian blur | Same checks as the unused `web/src/lib/imageQuality.js`, on the server |
| Libraries to add | **None** | tfjs-node, onnxruntime and friends need native binaries and RAM the plan doesn't have |

## 4. What already exists (reuse, don't duplicate)

- **For You** (`services/recommendation.service.js`): a hybrid of content and
  popularity signals (orders, cart, wishlist, device-side views and searches),
  category/shop weights, freshness, a shop-repeat cap; tested
  (`tests/for-you.test.js`). Module 01 extends it; it is not replaced.
- **Search**: `products.search_text` + `utils/searchTerms.js` (Tagalog/English
  synonyms, stopwords, singular forms, typo correction, relevance scoring of
  up to 300 rows). Module 03 adds TF-IDF ranking on top and keeps this as the
  fallback.
- **Best seller**, `soldCount`, `ratingAvg`, `reviewCount` on products (hourly
  reconcile).
- **Views**: `product_views` = views per product per day (no per-person
  rows), used by the seller's view-to-order funnel.
- **Stock**: `lowStockThreshold`, `LOW_STOCK` notifications, the
  `inventory_movements` ledger (every sale, restock, cancellation).
- **Seller packages** (`ProductType.PACKAGE`): seller-made bundles. Module 09
  only suggests; a seller makes the package.
- **Abuse controls**: rate limits, open-order caps, `buyerRecord` (no-shows),
  COD phone verification, reports with FRAUD / FAKE_ORDER reasons, the admin
  attention queue. Module 08 adds flags for review, nothing automatic.
- **Bad-word filter** (`utils/badWords.js`, Tagalog + English), used for chat
  and comments, not reviews.
- **Order lifecycle**: one write point, `orderRepository.updateStatus`, with
  `order_status_history`. That is where `order_completed` / purchase events
  come from, once per order.
- **Payments**: GCash and QR Ph are paid to the shop directly and checked by
  the seller from a proof photo; there is no gateway and no payment-attempt
  table, so "repeated failed payment attempts" means repeated FAILED proofs
  in `order_status_history`.

## 5. The data today (the most important finding)

Live, 10 Nov 2026: **23 products, 12 shops, 5 products with any sale, 43
units sold in all, 12 reviews.**

That decides what each module can honestly show now (the doc forbids made-up
results):

| Module | Works now? |
|---|---|
| 01 Recommendations | Yes, as content + popularity (cold start is the normal case). Collaborative parts switch on by themselves past a threshold |
| 02 Demand forecast | Mostly "not enough sales yet" (needs ~4 weeks with sales per product) |
| 03 Semantic search | Yes (it needs product text, not sales) |
| 04 Segmentation | Per shop, mostly too few buyers; shown above a minimum count |
| 05 Purchase prediction | **No**: nothing to train on. Built with a gate; reports "insufficient data" until enough outcomes exist |
| 06 Inventory risk | Yes for stock levels; days-to-stockout only where there are recent sales |
| 07 Sentiment | Yes per review; trends need more reviews |
| 08 Anomaly flags | Rules work now; statistical parts need history |
| 09 Bundles | Too few multi-item orders now; shown when support is met |
| 10 Image quality | Yes (works on any upload) |

So the engine is built to grow into its data: every module has a minimum,
shows "not enough data yet" below it, and starts producing results by itself
as orders arrive.

## 6. Database plan (additive only)

New tables, following the existing migration style (hand-written SQL,
`VARCHAR(191)` ids, `DATETIME(3)`, named indexes, expand only):

| Table | For | Notes |
|---|---|---|
| `ml_events` | add-to-cart, remove, favourite, purchase, review, stock change… | See decision A. Unique key on (type, entity, actor, dedupe key) so a purchase counts once. Retention job |
| `ml_predictions` | cached results: similar products, bundles, forecasts, stock risk, segments | (model_key, entity_type, entity_id) unique, `expires_at`; replaced on each run |
| `ml_model_versions` | parameters (small JSON), metrics, status ACTIVE / CANDIDATE / RETIRED | Rollback = mark an older version ACTIVE |
| `ml_training_runs` | each run: started, finished, status, metrics, error summary, duration, rows | Admin history and failure view |
| `ml_alerts` | anomaly flags and stock alerts with review status | PENDING_REVIEW, CONFIRMED_SUSPICIOUS, CLEARED, ESCALATED |
| `app_settings.ml_settings` | JSON: one switch per module, all **off** by default | Same pattern as `referral_settings` |

Rollback: each migration's header lists the `DROP TABLE` / `DROP COLUMN`
statements that undo it; nothing existing is altered. Two deploys: the
migration first, then the code that uses it.

## 7. Where it shows

- **Buyers:** Home's For You (better ranking, a trending row), the product
  page's "Similar items" (content similarity instead of same-category) and a
  new "Often bought together", cart suggestions, search ranking. Web and app.
- **Sellers:** an "Insights" section in Analytics (forecast, stock risk with
  days left, buyer groups, viewed-but-not-bought products, review themes,
  bundle ideas), photo-quality tips in the product form. Web and app.
- **Admins:** `/admin/ml` (modules on/off, versions, runs, metrics, errors,
  retrain, roll back) and anomaly flags in the attention queue. Web only (the
  app has no admin screens).

## 8. Risks

| Risk | Handling |
|---|---|
| CPU/RAM on a capped plan | Jobs time-boxed and batched, one ML job at a time, no request-time training; the existing job lock |
| Breaking browsing or checkout | ML read paths wrapped: any error returns the current behaviour. Writes (events) are fire-and-forget after the business write |
| Misleading numbers with little data | Minimums per module; "not enough data yet" states; metrics compared with a naive baseline before a model is activated |
| Privacy | Decision A; aggregated insights for sellers (only their own shop, minimum group sizes) |
| An ML flag hurting a real buyer | Flags only; nothing suspends, cancels or blocks |
| Database load | Indexes on every new query path; jobs read with bounded pages; 5-connection pool respected |

## 9. Two things for the owner to decide

**A. Personal activity on the server.** Today recently viewed items and search
words stay on the buyer's device by design ("nothing new is stored"). The
blueprint's event log would keep per-person views and searches on the
server. Options: keep that on the device and store only per-product totals
(plus purchases, carts and favourites, which the server has anyway), or store
per-person events for signed-in buyers with a retention limit and a privacy
policy update.

**B. Moormy uses a hosted AI.** The seller assistant (`assistantCore.js`)
sends typed questions to a model on Hugging Face when `HF_TOKEN` is set. The
blueprint forbids hosted inference for the ML engine. Moormy is a separate
feature; it can stay as it is, or be switched off.

## 10. Phases

| Phase | Builds | Done when |
|---|---|---|
| 1 Foundation | `backend/src/ml/` (registry, switches, time-boxed runner on `runJob`, event writer, prediction store, model versions, logging), the migration, `/api/ml` routes with auth and limits, `/admin/ml` page (status, switches, runs) | Tests green; every module off by default; site unchanged with it off |
| 2 Buyer intelligence | Similar products, often bought together / bundles, semantic search ranking, For You + trending | Web + app show them; fallbacks tested |
| 3 Seller intelligence | Forecast, stock risk, buyer groups, product performance; Insights in Analytics (web + app) | Seller sees only their shop; minimums enforced |
| 4 Reviews, safety, photos | Sentiment + themes, anomaly flags + admin review, photo-quality checks; purchase prediction behind its data gate | Flags never act on their own |
| 5 Hardening | Evaluation vs baselines, version activation and rollback, retention, monitoring in `/health` and `/admin/ml` | Rollback tested |

Each phase ends with the full backend test suite (about 300 tests) plus new
ML tests on `emoorm_ci_test`, a web build, and an app check, before the next
one starts.
