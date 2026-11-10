# Moormy voice assistant: Phase 0 audit and plan

The audit the Moormy blueprint (§2, §17 Phase 0, §20) asks for before any
code. Nothing in the application was changed to write this. 10 Nov 2026.
The hosting, stack and database findings of the ML audit
([../ml/PHASE0-AUDIT.md](../ml/PHASE0-AUDIT.md)) still hold and are not
repeated here.

## 1. What already exists

**Moormy today** (a guide-based helper, not yet a shopping assistant):

| Piece | Where | What it does |
|---|---|---|
| Engine | `backend/src/services/assistantCore.js` | Answers from a written guide (topics, keywords, suggested questions, English/Tagalog detection). Typed questions go to a small open model on **Hugging Face** when `HF_TOKEN` is set (it is, locally), else the best guide topic answers. Off-topic questions are turned away. |
| Buyer side | `buyerAssistant.service.js` + `buyerAssistantGuide.js`, `POST /api/buyer-assistant/chat` | How shopping on E-MOORM works, plus the buyer's own open orders by My Orders tab and their returns |
| Seller side | `sellerAssistant.service.js`, `/api/seller-assistant` | The same for sellers (Seller Center) |
| Web UI | `web/src/components/moormy/` (MoormyThread in Messages, MoormyDock floating in Seller Center, MoormyEntry), `lib/moormyChat.js` | The chat. **History is kept on the device only** (localStorage, per account) |
| App UI | `mobile/src/components/inbox/MoormyThread.js`, MoormyFace | The same in the app's Messages |
| Mascot | `web/src/components/avatars/mascotParts.jsx`, Mascot.jsx, DraggableMascot.jsx; Home's ChatDock tab | Animated SVG mascot (layers animated on the GPU), peeking from the Messages tab |

**The marketplace intelligence of blueprint §12** was built in the ML engine
(docs/ml/README.md, live since 10 Nov, off until switched on):

| §12 item | Status |
|---|---|
| 12.1 Personalised recommendations | Done (For You + similar + trending). Uses device-side views and searches, as the owner chose |
| 12.2 Intelligent search | Done (meaning-based ranking on the keyword search) |
| 12.3 Frequently bought together | Done (support, confidence, lift, minimums) |
| 12.4 Demand forecasting | Done |
| 12.5 Inventory predictions | Done (never changes stock) |
| 12.6 Seller insights | Done (Insights section) |
| 12.7 Product categorisation | **Not built**: suggest a category from a new listing's title and description |
| 12.8 Recommendation explanations | **Not built**: "Because you viewed…", "Often bought together", "Popular" |

**What Moormy can reuse for shopping** (no new catalogue, no new APIs for data):
`GET /products` (search, category, town, price range, sort, with the ML
meaning ranking), `/ml/recommendations/similar/:id`, `/ml/bundles/*`, the
product page data, the buyer's orders (`/orders/my/orders`), and the cart.

**The cart lives in the browser** (zustand store, saved whole to
`PUT /me/cart`; prices and stock are checked again at checkout). So "add to
cart" and "remove from cart" are actions the page performs with the existing
cart store, never server writes by the assistant.

## 2. What the browsers can do (the wake word)

The blueprint wants "Hey, Moormy" heard on the device, without streaming the
microphone anywhere. The options:

| Option | Local? | Cost | Verdict |
|---|---|---|---|
| **openWakeWord** models run in the browser with onnxruntime-web (WebAssembly) on an AudioWorklet | Yes, fully | A custom "Hey Moormy" model must be **trained once** (its training notebook makes synthetic voices and trains a small network: ~1 h on a free Google Colab GPU; on this PC it needs Python, which is not installed, several GB of downloads and hours of CPU). In the browser: ~10 MB WebAssembly + ~3 MB models, downloaded only when a person turns listening on, cached after | **Recommended** |
| Vosk (Kaldi) in WebAssembly, listening for a fixed phrase | Yes | ~40 MB model; "Moormy" is not an English word, so it would be matched by sound-alikes: unreliable | No |
| Picovoice Porcupine | Yes at runtime | Needs a Picovoice account key checked online and a paid licence for a commercial marketplace | No (external platform) |
| The browser's own speech recognition, listening all the time | **No**: Chrome sends the audio to Google continuously | Free | No (breaks the privacy rule) |

**What can be promised:** listening only while E-MOORM is open in an active
tab of a supported browser (Chrome, Edge, Safari 16.4+, Firefox) on HTTPS,
with a visible "listening" indicator and an off switch. When the tab is
hidden or the browser suspends audio, listening pauses and says so. Phones:
works in the browser while the page is in front; battery use is real, so it
is off by default. **Not promised:** listening with the tab closed, in the
background, or with the screen off.

**The app (Expo):** a wake word needs a native module (onnxruntime for React
Native) and a new build, and Google Play / App Store rules for always-on
microphones (a foreground notification, a declared purpose). Recommended
later, after the web version proves itself; the app gets the conversation,
voice input by button, and speech output first.

## 3. Speech in and out

| | Browser-native | Fully local alternative |
|---|---|---|
| **Speech to text** (after the wake word, or the mic button) | Web Speech API: Chrome/Edge send **the spoken request** to Google/Microsoft, Safari to Apple; Firefox has none. Supports English and Filipino (fil-PH) on Chrome | Vosk WebAssembly: English only (~40 MB), no Filipino; Whisper in WebAssembly is too slow on phones |
| **Text to speech** | speechSynthesis: free, on the device; voices differ per device; a Filipino voice is rare, English voices everywhere | none needed |

Recommended: browser-native for both, with a clear note that the spoken
request (not the waiting time) goes to the browser's speech service, and a
text box always available.

## 4. The plan (adapted to what exists)

| Phase | Builds | Main files |
|---|---|---|
| 1 Engine | A **local intent engine** for shopping (no paid AI): intents (search, cheaper, under ₱X, compare, about this product, cart, orders, navigate, help), entities (price, category, town, sweet/gift/… via the ML concepts), conversation state (the last search, the products shown), answers built only from real records. One endpoint `POST /api/moormy/turn` taking the text, the page context and the conversation state, returning words + product cards + suggested actions. Reuses product search, ML similar/bundles, and the buyer's orders | `backend/src/moormy/` (intents, entities, resolver, actions, replies), routes, tests |
| 2 Conversation | A **global** Moormy for buyers on the web: the floating mascot (reusing the mascot pieces and the Messages tab) opening a panel with text, a mic button, spoken replies (mute, stop, replay), product cards (the existing ProductTile), follow-up suggestions. One history shared by typing and voice, kept on the device as today | `web/src/components/moormy/` (new MoormyGlobal, panel, state machine), App.jsx |
| 3 Wake word | openWakeWord in an AudioWorklet + onnxruntime-web, lazy-loaded; the state machine of blueprint §5; pause while Moormy speaks (so it cannot wake itself), on hidden tabs, on device changes; permission and error states; off by default with a clear switch | `web/public/moormy/` (models, worklet), `web/src/lib/moormy/wakeWord.js` |
| 4 Page awareness | A small page-context provider: route, page type, the product / search / cart / order in view, as structured ids (never the page HTML); the server reads the real records | `web/src/lib/moormy/pageContext.js`, hooks in the pages |
| 5 Actions | A fixed action registry: search, open product, filter, add/remove cart (via the cart store, with a confirmation when unclear), show orders, track an order, go to a page. Each with validated parameters and the person's own permissions. Never orders, payments, cancellations or addresses without the person doing it themselves; never asks for passwords or OTPs | `backend/src/moormy/actions.js`, `web/src/lib/moormy/actions.js` |
| 6 ML extras | Category suggestions in the product form (12.7, TF-IDF on existing listings); "why" lines on recommendations (12.8) | ML engine, product form |
| 7 Test and tune | Browsers and phones, wake-word false accepts and latency, CPU and memory, no duplicate microphone sessions | tests, measurements |

The existing guide answers (how shopping works, my orders) become one of the
engine's intents, so nothing Moormy answers today is lost.

**Database:** nothing new is needed for Phases 1-5 (history stays on the
device; no per-person events, as chosen for the ML engine). Phase 6 may add
nothing either (the ML tables cover it).

**Dependencies:** `onnxruntime-web` (web only, lazy-loaded, from the
package, not a CDN); the trained "Hey Moormy" model files. Nothing on the
server.

## 5. Risks

| Risk | Handling |
|---|---|
| Wake-word false triggers (TV, talk) | A tuned threshold, a short confirmation chime, and it only opens Moormy: it never acts without a request |
| Battery and CPU on phones | Off by default; lazy load; pause on hidden tab; measured on a low-end phone |
| Speech recognition sending audio to a browser vendor | Only the request after the wake word or the mic tap, disclosed in the panel; text always available |
| An answer that sounds right but is wrong | Answers are built only from returned records; "none found" is said plainly |
| Clutter on Home (Messages tab, Start selling sticker, install bar) | Moormy takes the Messages tab's mascot rather than adding another floating thing |
| Hugging Face model (external) | See decision C below |

## 6. Decisions for the owner

A. **Training the "Hey Moormy" wake word** (one time): a Google Colab
   notebook run by the owner (about an hour, free; I prepare it), or Python
   installed on this PC and trained on its CPU (several GB, hours), or no
   wake word yet (a mic button only) and decide later.

B. **Speech to text:** the browser's own (English and Filipino; the spoken
   request goes to Google/Apple/Microsoft), or fully local (English only,
   a 40 MB download, no Filipino).

C. **Moormy's Hugging Face model** for free-form questions: drop it (the
   blueprint asks for no external AI; the local engine and guide answer), or
   keep it as a fallback for questions the engine cannot place.

D. **Where first:** the website (recommended), then the app.
