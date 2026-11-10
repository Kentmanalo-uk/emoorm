# Moormy, the shopping assistant

The blueprint is the "E-MOORM Machine Learning & Moormy Global Voice
Assistant" brief; the audit and plan are in [PHASE0-AUDIT.md](PHASE0-AUDIT.md);
training the wake word is in [WAKE-WORD-TRAINING.md](WAKE-WORD-TRAINING.md).

| Phase | Status |
|---|---|
| 1 Local shopping engine | **Done** (10 Nov 2026) |
| 2 Conversation (global Moormy on the website, text + mic + speech) | **Done** (11 Nov 2026): web/src/components/moormy/MoormyGlobal, MoormyPanel; replies spoken only when the person spoke |
| 3 "Hey Moormy" wake word | **Done on the website** (11 Nov 2026) as "Teach Moormy your voice" (see below), off by default; not yet tried with a real person's voice |
| 4 Page awareness | **Done** (11 Nov 2026): web/src/lib/moormy/pageContext.js, useMoormyPage() on product, shop and search pages |
| 5 Actions on the page (cart, navigation) | **Done** (11 Nov 2026): web/src/lib/moormy/actions.js; remove asks first; never orders or pays |
| 6 Category suggestions, "why" lines | **Done** (11 Nov 2026): ML module 11 and `src/ml/why.js`, see docs/ml/README.md |
| 7 Test and tune | Website checked 11 Nov 2026 (unit tests, phone and computer, guest and signed in, a simulated wake); still to do: real voices and real phones, then the app |

Owner's decisions (10 Nov 2026): no wake word for now (see below); speech to text by the browser's own service;
the buyer helper no longer uses the hosted Hugging Face model (the seller
helper still does); the website first, the app later.

## The wake word is on hold

openWakeWord's training notebook says the data it trains on has "a mixture
of different licenses and usage restrictions" and that models trained with
it "should be considered as appropriate for non-commercial personal use
only". E-MOORM is commercial, so on 10 Nov 2026 the owner chose a tap on
Moormy and the mic button instead. To revisit: a wake-word engine licensed
for commercial use, or a model trained only on commercially licensed data.

## The wake word: "Teach Moormy your voice" (chosen 10 Nov 2026)

No pre-trained model and no training data (so no licence question): each
person says "Hey Moormy" three times in Moormy's settings; the browser keeps
three MFCC fingerprints on that device (no audio uploaded or stored). While
listening is on, an energy-based voice detector picks out short bursts of
speech the length of the phrase, and each burst is compared with the three
fingerprints by dynamic time warping; a close match opens Moormy. All code is
ours (Web Audio AudioWorklet, FFT, mel filterbank, MFCC, DTW). Off by
default; a visible indicator; paused while Moormy speaks and on hidden tabs;
re-record or delete at any time. Best for the person who recorded it, in a
fairly quiet room, with E-MOORM open in a browser tab; the mic button always
works. Built after Phase 2 (the panel it opens).

**The library** (web/src/lib/moormy/wake/):

- `dsp.js`: MFCC with a -50 dB floor and a little dither, and DTW (band, length-normalised).
- `voice.js`: `takeSaying`, `learnVoice`, `createMatcher`, and storage on the device.
- `listener.js`: the mic, `recordSaying` and `createListener`.
- The worklet `web/public/moormy/capture-worklet.js` brings the mic down to 16 kHz.

**Settings:**

- A saying is 350-1800 ms long.
- The threshold is max(12, min(22, worst distance between the three takes × 1.6 + 4)).
- Three takes further apart than 22 are refused as "inconsistent".
- `sensitivity` scales the threshold.

**Calibration (11 Nov 2026)** used Windows' built-in voices (David and Zira), with room noise and silence added. The voice was learned from three takes at different speeds:

| What was said | Distance | Woke? |
|---|---|---|
| The same voice, other speeds | 0-6.5 | Every time |
| The other voice saying "Hey Moormy" | about 20 | No (it is per person, by design) |
| Different phrases ("Hello there", "Remove the last item", "Good morning", "Hey Mary") | 15-34 | No |
| Near-sound-alikes "Hey money" and one voice's "Hey mommy" | 10.8-12.4 | Yes |

The learned threshold was 13.4. Real people vary more between takes than a synthetic voice does, so their thresholds come out higher. A false wake only opens the panel. Tune with the panel's test view on real voices.

## Phase 1: the engine (backend/src/moormy)

No language model. `understand.js` reads a request (English, Tagalog,
Taglish) into an intent and what it names; `engine.js` answers from records
this server returns; `replies.js` holds Moormy's lines.

**Intents:** greeting, thanks, bye, help, search, more, cheaper, similar,
compare, about (the product in view or "the second one"), cart_view,
cart_add, cart_remove, orders, navigate, guide (how-to questions, answered by
the buyer guide), and "not sure".

**What it reads in a request:** prices ("under 100", "₱150 pababa", "budget
1.5k", "one hundred pesos", "dalawang daan", "between 100 and 200"), towns
("Calapan" for Calapan City), categories, sorting ("cheapest", "best-rated",
"mabenta", "newest", "mura"), which item ("the second one", "the last",
"pangalawa", "this", "ito"), quantities, and the product words left over
("a gift for my mother" -> "gift").

**Answers:**

- Products come from the marketplace's own search (`productService.getProducts`,
  with the ML meaning ranking when that module is on), at their stored
  prices, as the same public cards the lists show. Best-rated re-sorts a wider
  page by stored rating (the search has no rating sort).
- When no product has the words, it searches what they mean (the ML
  concepts: "pasalubong" -> gift, delicacy, snack…) and says the results are
  close, not exact. When nothing at all matches, it says so.
- "Cheaper ones" keeps the last search and caps it below the middle price of
  what was shown; on a product page with nothing searched, similar but
  cheaper (the ML similar list, filtered by price).
- Compare: two products (ordinals into what was shown, or the page's product
  and one shown): price difference, ratings, stock, shop, town.
- About: price (and sale), stock (or "cooked to order"), seller and town,
  rating, gift suitability from the listing's own words and category, the
  shop's description quoted.
- Cart: the page sends its cart's ids and quantities; prices and totals are
  read here. Add: only a product that can be sold now (shop taking orders,
  in stock), as a proposed action. Remove: a proposed action that needs a yes.
- Orders: the signed-in person's own (an order number of someone else's is
  "not found"); guests are asked to sign in.
- Navigate: a fixed list of the site's pages.

**Conversation:** stateless on the server. The page sends `state` (language,
turn, last search, products shown, product in focus) and gets the new one
back, so typed and spoken turns share one history, kept on the device. What
the page sends is cleaned (ids, numbers, page types, at most 100 cart lines).

**Never:** places, pays for or cancels an order; changes an address; asks for
a password or a code; invents a product, a price or a feature.

## Moormy drives the site (11 Nov 2026, the owner's request)

Moormy works the site's own pages the way a person taps them, rather than only answering in her panel.

| Said | What happens |
|---|---|
| "Find me a pasalubong" | The results page opens, searched (`/products?q=…`). If nothing has the word itself, she searches the closest word that finds the most and says so. |
| "Cheaper" | The page's own price filter and Price sort change: below the middle price in view, or below the dearest one if half of them are already at the lowest price. |
| "Under 200", "from Calapan only", "newest first", "price high to low" | The search in view is narrowed; its words are kept. |
| "Clear the filters", "any price" | Filters off; the words searched stay. |
| "Open the first one" | The page's first product opens. The results page tells her what it lists, in order (`useMoormyPage({ listed })`). |
| "Go back" | The browser's Back. |
| "Show more" | The results page scrolls on; it loads more as it goes. |

"Best rated" stays in her panel, because the page has no rating sort.

**No sticker on the pages (owner, 11 Nov 2026; it took space).** The floating Moormy and its press-and-hold are gone from buyer pages.

- **"Hey Moormy" brings her:** she appears as the small bar at the bottom with the screen glow, already listening. Your words show as you say them, then your request in quotes above her answer. She goes about 12 seconds after she is done; the arrow opens her full panel.
- **Setting it up:** her chat in Messages has a "Set up “Hey Moormy”" button and ⋯ › Voice assistant (`MoormyVoiceSheet`): read replies aloud, teach your voice, switch listening on.
- **While listening:** a small pink dot in the corner says the mic is on. After a reload, listening starts again on the first tap anywhere, because browsers only open the mic from a tap.
- **Typed chat** with Moormy is in Messages.

**The screen glow:** while she listens, thinks or speaks, and for about 2.4 seconds after she changes the page, pink and light green light runs around the screen edges. It takes no clicks and stays still for people who ask for reduced motion.

### Voice works the screen; the typed chat only offers (owner's rule, 11 Nov 2026)

- **Spoken to** (the mic, press and hold, "Hey Moormy"; `context.drive: true`): she does it on the page.
- **Typed in the chat** (or a suggestion tapped): nothing on the page moves.
  - Places and results become links ("See them on the page").
  - What she would press or type becomes a button ("Tap “Best Sellers”"), which is the person's own tap.
  - Her words say so ("That's the "Best Sellers" button. Tap it below…").

### Anything on the screen

Each request carries the screen as the page lists it: `web/src/lib/moormy/screen.js` `collectScreen`.

- **What is listed:** buttons, links, tabs, ticks, lists and fields, by their labels (aria-label, label, text). Those in view come first, up to 160.
- **What is never listed:** Moormy's own controls, hidden or disabled ones, password and card fields.
- **What is never sent:** what is typed in a field.

What she understands:

| Said | What she does |
|---|---|
| "tap / click / press / select / choose / pindutin X" | Presses X. |
| "follow this shop", "save", "buy now" | Presses the button named by what it does. |
| "type X in Y", "set quantity to 3" | Types in the field, the way the page's own code hears it. |
| "scroll up / down / to the top" | Scrolls the page. |
| The exact name of something on the screen ("Today's Menu") | Presses it, like a tap. |

How she matches and acts:

- **Matching** (engine.js `onScreen`): the words said against each label, close spellings counting. Two different labels that fit as well are asked about: "Which one: …?"
- **Not on the screen:** a filter or place name becomes that request ("select vegetables" searches Vegetables). Anything else is said not to be there; nothing near it is pressed.
- **On the page:** the element she presses gets a pink-and-green ring for a moment.

Hands off:

- **Never pressed for anyone:** paying, placing or confirming orders, deleting, cancelling an order, signing out, reporting, blocking, sending, submitting. Refused by the words said too, so nothing nearby is pressed in their place.
- **Asked first:** "Remove", clearing the cart, unfollowing. A spoken yes ("oo", "sige") or a tap in the panel presses it as the screen is then; no leaves it.

### Typos

`backend/src/moormy/spell.js` corrects each word she doesn't know to the closest one she does, before the request is read:

- **What she knows:** her own words in English and Tagalog, the shopping concepts, towns, categories, and the words of live product names.
- **How far a fix may go:** three-letter words only to her own words, one letter off; longer ones one letter, eight or more two. Swapped letters count as one.
- **Examples:** "fnd me pasalubng", "cheeper", "opne the frist one", "ad to cart", "calapn".
- **Saying so:** a product word read differently is mentioned: (I read "hony" as "honey").

How it works:

- The engine proposes `show_results` with the search, or `back` or `scroll`.
- The page writes the search as the results address (`web/src/lib/moormy/pageContext.js` `resultsPath`), and the page reads it from there exactly as its own filters do.
- On phones, after she acts, her panel shrinks to a small bar with her last line and the mic, so the page shows and the talk goes on.

## API

`POST /api/moormy/turn` (anyone; signed in adds their orders; 40 a minute):

    { text, state?, context?: { pageType, productId, storeId, orderId, search, listed: [productId], cart: [{ productId, quantity }] } }
    -> { intent, lang, say, speak, cards, compare?, cart?, orders?, actions, suggestions, state }

`actions` are proposals: `{ type: 'cart_add', productId, quantity }`,
`{ type: 'cart_remove', productId, confirm: true }`, `{ type: 'navigate', to }`.

## Tests

`backend/tests/moormy.test.js`: the blueprint's example requests; Tagalog,
towns, categories, prices in words; search/cheaper with prices checked
against the database; compare and about; cart totals from the database, add
only what can be sold, remove asks first; orders only the person's own;
guide answers with no outside AI; what the page sends cleaned; the endpoint.
