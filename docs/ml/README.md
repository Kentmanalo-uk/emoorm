# The ML engine

E-MOORM's machine learning runs inside its own Node server, on its own
database, with no outside AI service (the blueprint is `ML_DOC.MD` at the repo
root; the audit and plan are in [PHASE0-AUDIT.md](PHASE0-AUDIT.md)). It is
built in phases; this page is updated with each one.

| Phase | Status |
|---|---|
| 1 Foundation | **Done** (10 Nov 2026) |
| 2 Buyer intelligence (similar items, bought together, search, trending) | **Done** (10 Nov 2026) |
| 3 Seller intelligence (forecast, stock risk, buyer groups, performance) | **Done** (10 Nov 2026) |
| 4 Reviews, safety, photos (sentiment, unusual activity, photo quality, purchase prediction) | **Done** (10 Nov 2026) |
| 5 Hardening (evaluation vs baselines, activation rules, monitoring) | **Done** (10 Nov 2026) |

## Rules it keeps

- **Off until switched on.** The engine and each module start off. Off, the
  shop behaves exactly as before.
- **Never in the way.** Every ML read goes through `guard()` (src/ml/safe.js):
  an error or a slow answer gives the shop's usual result. Counting never
  slows or fails the action it counts.
- **Advice, not actions.** Nothing in the engine changes an order, a payment,
  stock, a review or an account. Flags wait for a person.
- **Real data only.** A module below its data minimum says "not enough data
  yet" rather than showing a guess.
- **Totals, not people.** The engine stores per-product totals (cart and
  favourite adds and removes per day). Views stay in `product_views`
  (per product per day); recently viewed and searches stay on the device.

## Code (backend/src/ml)

| File | What |
|---|---|
| `modules.js` | The ten modules: key, name, phase, schedule. A module is "built" once its phase attaches its `run` |
| `settings.js` | The switches (`app_settings.ml_settings` JSON): `read`, `merge` (refuses unknown keys and unbuilt modules), `isOn(key)` |
| `counters.js` | Per-product daily totals, buffered in memory and written once a minute in one statement |
| `track.js` | Hooks the shop's code calls (`savedBefore` / `savedAfter` in services/savedItems: cart and wishlist changes; a cart emptied by checkout is not counted as a removal) |
| `store.js` | Stored results (`replacePredictions`, `getPrediction(s)`), model versions (`createVersion`, `activateVersion`, `getActiveVersion`), runs, alerts (`raiseAlert`, once per thing), `purgeOld` |
| `runner.js` | `runModule(key)`: one ML job at a time, a time budget, every run recorded; `start(runtimeStatus)` sets the timers |
| `safe.js` | `guard(label, fn, fallback, ms)` for read paths |
| `admin.js` | What `/admin/ml` reads and does |

A module (later phases) is an object in `modules.js` given a
`run(ctx)` that reads in batches, checks `ctx.timeLeft()` between them,
writes with `store.replacePredictions`, and returns
`{ rowsRead, rowsWritten, metrics, modelVersion?, skipped?, reason? }`.

## Phase 2 modules

**01 Recommendations** (`recommendations.js`, daily). Per product, the 12
most similar products: TF-IDF cosine of their words (name ×3, category ×2,
kind/badge ×1.5, description ×1, shop ×0.5; Tagalog/English synonyms and
plurals as one word) 75%, same category 15%, close price 7%, same town 3%;
at most 4 from one shop; nothing under 0.12. Trending: engagement in the
last 14 days (views 1, cart adds 3, saves 2, units ordered 5) times growth
over the 14 before (−50% to +200%); a product needs 6 points, and the list
is shown only with 3 or more products. Metrics: coverage, average top score.
For You (services/recommendation.service) adds two score parts when it is
on: alike what the person ordered, carted, saved or viewed (+5 at most) and
trending (+1.5), and adds those alike products to its pool.

**03 Semantic search** (`search.js`, index in memory, rebuilt every 10 min;
the job every 6 h rebuilds and checks it). A query is read with its synonyms
and what its words suggest (`text.js` CONCEPTS: "pasalubong" → gift,
delicacy, snack…; "dessert" → sweet, halaya, ube…; "affordable/mura" prefers
cheaper matches). In `product.repository` rankedSearch (Best match), meaning
adds up to 30 points to each keyword match's score, and products that match
the meaning but not every word join the list, still inside every other
filter. Check: recall@3 of products searched by their own name (a run below
50% fails and is not used).

**09 Bundles** (`bundles.js`, weekly). A basket is one buyer's settled
orders (completed, delivered, picked up) on one Manila day. Pair counting
gives support, confidence and lift; kept when seen in 2+ baskets, lift > 1,
confidence ≥ 0.1, and only once there are 20+ baskets overall. Per product
up to 6 "often bought together"; per shop up to 10 bundle ideas from its own
pairs (a seller makes the package; nothing is published for them).

## Phase 3 modules (Seller Center › Analytics › Insights)

**02 Demand forecasting** (`forecasting.js`, weekly). Per product, weekly
units ordered (every order but cancelled ones; `sales.js`), 26 weeks back.
Methods: naive (last week, the baseline), 4-week average, simple exponential
smoothing (α 0.2/0.4/0.6), damped Holt (α 0.2/0.4 × β 0.1/0.3, φ 0.9). With
10+ weeks of history each is tried on the last 4 weeks (fitted on the rest)
and the lowest MAE wins; its RMSE gives the 80% range. 6 to 9 weeks: the
4-week average, marked "early". Under 6 weeks or 6 units: nothing, and the
seller is told what is needed. 90 days only with 26 weeks behind it.
"Prepare" = the top of next week's range. Trend: last 4 weeks vs the 4
before, ±25% and 2+ units. Metrics: average MAE vs the naive baseline's.

**06 Stock risk** (`inventory.js`, daily). Rate = the forecast's next 7
days / 7, else units in the last 28 days / 28. Days left = stock / rate;
OUT (0 stock), HIGH (≤ 7 days), MEDIUM (≤ 14), LOW, NO_SALES (no rate).
Restock = enough for 30 days (no supplier lead times are recorded). Only
products with stock of their own (not paluto, packages or Today posts). It
never changes stock.

**04 Buyer groups** (`segmentation.js`, monthly). Per shop, buyers with
settled orders in the last year, by recency, frequency and spend (RFM),
into fixed groups: inactive (> 120 days), new (one order ≤ 30 days ago),
frequent (3+ orders, last ≤ 60 days), high spenders (top quarter, with 8+
buyers), returning (2+ orders, last ≤ 90 days), occasional. Counts and
averages only, and nothing for a shop under 5 buyers. Plus new vs returning
buyers per month for 6 months.

**Viewed but not bought** (`performance.js`, worked out when asked, no
model; on with the engine). Last 30 days: views, cart adds, orders per
product; flagged with 20+ views and no orders, or 30+ views and under half
the shop's own rate; nothing under 50 views for the shop. Hints are facts:
one photo, a short description, priced 30% over the category median, out of
stock.

`insights.js` puts them in one answer; each part is off, insufficient (with
what it needs), unavailable (it failed; the rest still answers) or ok.

## Phase 4 modules

**07 Review sentiment** (`sentiment.js`, daily). An English and Tagalog
word list, not a downloaded model (English-only models misread Tagalog).
A review is cut at full stops and "but / pero / kaso"; each part scores its
words, doubled by "very / sobrang / napaka", flipped by "not / hindi /
walang" just before; phrases like "walang lasa" and "ok lang" have their own
meaning. Themes (taste, freshness, packaging, delivery, price, quality,
service, size) take the feeling of the part that names them: "Masarap pero
sira ang packaging" = taste positive, packaging negative, mixed. Shops and
products with 5+ reviews get a summary (split, praise, complaints with short
excerpts, months). Check: agreement with the stars (4-5 vs 1-2); a run under
60% (once 20 can be judged) is not used. Reviews and ratings are never
changed.

**08 Unusual activity** (`anomalies.js`, daily; `alerts.js` for admins).
Rules and robust statistics, no labelled fraud to learn from: 5+ orders in
24 h by one buyer; an order 3x and robust-z 5 above its shop's usual (shops
with 10+ orders); 2+ failed payment proofs in 14 days; 3+ unpaid, refused or
uncollected orders in 60 days; an account under 2 days old ordering 5x the
marketplace median (and ₱3,000+). Each flag is raised once, with its reason
and a 0-1 score, for a person to mark Pending, Confirmed suspicious, Cleared
or Escalated (audit-logged). Nothing is suspended, cancelled or blocked.

**10 Photo quality** (`imageQuality.js`, on upload). sharp makes a 128 px
greyscale copy: brightness (mean), contrast (spread), sharpness (variance of
the Laplacian), and the size of the shorter side, with the website's ID-photo
thresholds (600 px; dark < 60; bright > 235; blurry < 60; flat < 25). Advice
only; it cannot tell whether a product is genuine or allowed.

**05 Purchase prediction** (`purchase.js`, weekly). Logistic regression on
order history only (no per-person views are stored): for each past order,
the product (1) and 3 random others (0), with features as they were just
before it (earlier orders in its category and shop, a re-buy, its
popularity, price against their usual, same town). Time split 80/20; AUC and
log loss against popularity alone; nothing trained under 200 purchases, and a
model that does not beat popularity by 0.02 AUC is not used. Shown to nobody:
never used for prices or messages.

## Phase 5 (hardening)

- **Gates before use:** similar items need matches for half the catalogue
  (10+ products); forecasts must not be worse than repeating last week;
  search must find 50% of products by their own name; sentiment must agree
  with the stars 60%; purchase prediction must beat popularity. A run that
  fails its gate keeps the version in use.
- **Rest after failures:** a scheduled job whose last 3 runs failed waits a
  day (Run now still tries), so a broken job is not retried in a loop.
- **Versions:** each model keeps the one in use and its 10 newest others.
- **Response times:** every guarded step records its calls, fall-backs and
  p50/p95 times in memory: /admin/ml and `/health` (detail) show them.

## Database (migration `20261110090000_ml_foundation`)

| Table | Holds | Kept |
|---|---|---|
| `ml_event_counts` | (day, event_type, product_id) → count; events `cart_add`, `cart_remove`, `favorite_add`, `favorite_remove` | 400 days |
| `ml_predictions` | one result per (model, kind, entity), JSON value, `expires_at` | until it expires (removed daily) |
| `ml_model_versions` | parameters + scores; one ACTIVE per model, older ones RETIRED | always (small) |
| `ml_training_runs` | each run: trigger, status (OK, SKIPPED, FAILED, TIMED_OUT), duration, rows, scores, heap change, short error | 90 days |
| `ml_alerts` | flags for review: type, entity, shop/town, severity, score, status (PENDING_REVIEW, CONFIRMED_SUSPICIOUS, CLEARED, ESCALATED; RESOLVED) | closed ones 180 days |
| `app_settings.ml_settings` | `{ enabled, modules: { key: boolean } }` | |

Model parameters live in the database, not in files: the app folder is
replaced on every deploy, and the database is private and backed up.

**Undo:** the migration's header lists the statements (drop the column and
the five tables), to run only after the code that uses them is gone.
**Deploy:** the migration can go out first on its own; nothing reads it yet.

## API

Public (work with the engine off: a fallback or an empty list; 120 a minute per IP, cached 60 s):

| Route | Gives |
|---|---|
| `GET /api/ml/recommendations/similar/:productId?limit=` | `{ products, source }`: similar products ('ml'), else the same category as before ('category') |
| `GET /api/ml/recommendations/trending?limit=` | trending products, or [] |
| `GET /api/ml/bundles/products/:productId?limit=` | often bought together (each with `bundle: { confidence, lift }`), or [] |
| `GET /api/ml/bundles/cart?ids=a,b&limit=` | bought with what is in the cart, not already in it, or [] |

Signed in (any role): `POST /api/ml/reviews/analyze { text }` reads a text's sentiment (nothing stored).

Buyers: `GET /api/ml/purchase-probability/:productId` (their own chance; not shown anywhere yet).

Sellers and admins: `POST /api/ml/images/analyze` (a photo, multipart `image`, or `{ url }` of one of this server's uploads).

Admins (a municipal admin: their own town): `GET /api/ml/fraud/alerts?status=&type=&page=`, `GET /api/ml/fraud/alerts/pending`, `PATCH /api/ml/fraud/alerts/:id { status, note }`, `POST /api/ml/fraud/evaluate { orderId }`.

Sellers (their own shop only):

| Route | Gives |
|---|---|
| `GET /api/ml/reviews/insights` | what buyers say in their reviews (also `reviews` in insights/mine) |
| `GET /api/ml/bundles/mine` | `{ on, ideas, ordersWithTwoOrMore, needed }` |
| `GET /api/ml/insights/mine` | `{ on, forecast, stock, buyers, performance }` (see insights.js) |
| `GET /api/ml/forecast/products/:productId` | one of their products' forecast and stock outlook (another shop's: 404) |

Super admins:

| Route | Does |
|---|---|
| `GET /api/ml/status` | switches, each module (built, on, last run, model in use, job), this week's totals and failed runs |
| `GET /api/ml/runs?module=&page=&pageSize=` | runs, newest first |
| `GET /api/ml/models/:key/versions` | a model's versions |
| `POST /api/ml/models/:key/versions/:version/activate` | put a version in use (roll back); audit-logged |
| `POST /api/ml/modules/:key/run` | run a module (or `housekeeping`) now, in the background |
| `PUT /api/app-settings { mlSettings }` | change the switches (existing settings route) |

Run and activate are limited to 10 a minute per admin.

## Jobs (backend/server.js → `runner.start`)

All through `lib/runtimeStatus.runJob`, so a job runs once across copies of
the server and `/health` reports one that is late.

| Job | When | Does |
|---|---|---|
| counts writer | every minute (plain timer, per process) | writes buffered totals |
| `ml-housekeeping` | daily, first 7 min after start | writes totals, removes stale results, old runs, old totals, old closed alerts |
| `ml-<module>` | the module's schedule, from 10 min after start, 90 s apart | runs the module if switched on (later phases) |

Each run gets `ML_JOB_BUDGET_MS` (default 20 000 ms) plus a short grace; a run
that overruns is recorded as TIMED_OUT and the next waits until it stops.

## Admin page

`/admin/ml` (Platform › ML engine, super admins): the switches, each module's
schedule, last run and model in use, run now, versions with "Use this
version", and every run with its time, rows and scores.

## Tests

`backend/tests/ml-phase4.test.js`: sentiment on the blueprint's example,
Tagalog, negation and lukewarm, a shop's summary and the read endpoint;
the anomaly rules and robust z; flags raised once, scoped by town, judged
and audit-logged, nothing else touched; photo checks on sharp, blurred,
dark and small images and the endpoint; purchase prediction learning,
AUC, and waiting for data; the rest after 3 failures, version clean-up and
response times.


`backend/tests/ml-phase3.test.js`: forecasts below the minimum, early,
validated, rising, 90-day; MAE/RMSE/MAPE; the blueprint's stock example
(40 at 5 a day = 8 days), out of stock, no sales; the RFM rules and the
5-buyer minimum; the viewed-but-not-bought rule; a seller's insights from 12
weeks of real orders, their shop only, no buyer named; one failing part
leaving the others.


`backend/tests/ml-phase2.test.js`: words and query reading; similar lists
(words first, shop cap); support/confidence/lift and the minimums; the
product page endpoint (ML on, category off); trending order and its
minimum; For You ranking what is alike higher; bought together, the cart,
seller ideas (own shop only, buyers refused); bundles waiting for baskets;
semantic search finding by meaning, inside the filters, and falling back
when the engine fails. The modules are switched on inside that test's
process only (the settings row is shared with the other test files).


`backend/tests/ml-foundation.test.js` (run against `emoorm_ci_test`): switches
default off and validation; super-admin-only API; totals counted only while
on, checkout not counted as removal, no buyer stored; the cart still saves
when counting fails; runs recorded as OK / FAILED / TIMED_OUT / SKIPPED, one
at a time; the tidy-up; stored results replaced whole and stale ones not
served; versions, activation and roll back; alerts raised once; `guard`
fallbacks.
