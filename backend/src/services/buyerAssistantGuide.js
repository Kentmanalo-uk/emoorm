/**
 * Ate Moormy's buyer guide, in English and Tagalog: how shopping on Emoorm
 * works, in the words the app shows. Each topic answers on its own (the
 * suggested questions, and typed questions when no model is set up) and is
 * what the model answers from. Every fact here comes from the app itself
 * (checkout, My Orders, returns, identity verification…); keep both
 * languages in step when a screen or rule changes.
 *
 * Places: phones have the tabs Home, Cart, Messages, Notifications and
 * Profile. Answers name the phone place first.
 */

const seller = require('./sellerAssistantGuide');

const { LANGS, pick, TAGALOG_WORDS, GREETING, ABOUT_QUESTION, OFF_TOPIC_PATTERNS } = seller;

const NAME = 'Ate Moormy';

const greeting = (name, lang = 'en') => (lang === 'tl'
  ? `Hi${name ? ` ${name}` : ''}! Ako si **Ate Moormy**, ang shopping helper mo sa Emoorm. Magtanong ka tungkol sa pamimili sa Emoorm: paghahanap ng produkto, checkout, bayad, delivery o pickup, mga order mo, returns at iba pa. Puwede mo ring i-tap ang isang tanong sa ibaba.`
  : `Hi${name ? ` ${name}` : ''}! I'm **Ate Moormy**, your Emoorm shopping helper. Ask me about buying on Emoorm: finding products, checkout, payments, delivery or pickup, your orders, returns and more. You can also tap a question below.`);

const hello = (name, lang = 'en') => (lang === 'tl'
  ? `Hello${name ? ` ${name}` : ''}! Ano ang gusto mong malaman tungkol sa pamimili sa Emoorm?`
  : `Hello${name ? ` ${name}` : ''}! What would you like to know about shopping on Emoorm?`);

const ABOUT_ME = {
  en: "I'm **Ate Moormy**, Emoorm's AI shopping helper. I can explain how buying works (checkout, payments, delivery and pickup, cancelling, returns and refunds, vouchers, reviews and your account) and tell you which of your orders are waiting on you. I only answer questions about shopping on Emoorm.",
  tl: 'Ako si **Ate Moormy**, ang AI shopping helper ng Emoorm. Kaya kong ipaliwanag kung paano bumili (checkout, bayad, delivery at pickup, pag-cancel, returns at refunds, vouchers, reviews at ang account mo) at sabihin kung aling mga order mo ang naghihintay sa iyo. Tungkol lang sa pamimili sa Emoorm ang sinasagot ko.',
};

const OFF_TOPIC_REPLY = {
  en: 'Pasensya na, I can only help with shopping on Emoorm: finding products, checkout, payments, delivery and pickup, your orders, returns and your account. Try one of these:',
  tl: 'Pasensya na, tungkol lang sa pamimili sa Emoorm ang kaya kong sagutin: paghahanap ng produkto, checkout, bayad, delivery at pickup, mga order mo, returns at ang account mo. Subukan ang isa sa mga ito:',
};

const NOT_SURE_REPLY = {
  en: "I'm not sure about that one. Your municipal admin can help: open **Profile › Help & Support** and tap **New support case**.",
  tl: 'Hindi ako sigurado diyan. Matutulungan ka ng municipal admin mo: buksan ang **Profile › Help & Support** at i-tap ang **New support case**.',
};

const ADMIN_LINKS = [{ label: 'Help & Support', to: '/profile/support' }];

/** A map of the buyer's side, always given to the model. */
const OVERVIEW = [
  'Emoorm is an online marketplace for local shops in Oriental Mindoro, Philippines. Buyers pay the shop directly (cash, or the shop\'s GCash / QR Ph code); Emoorm adds no buyer fee and never holds the money.',
  'Phones have the tabs Home, Cart, Messages, Notifications and Profile. Profile has My Purchase (To Pay, To Ship, To Receive, To Pick Up), Orders & shopping (My Orders, Returns & refunds, My Addresses, Wishlist, Followed Stores, My Reviews), and More (Sell on Emoorm, Help & Support, My Reports, Settings).',
  'My Orders tabs: All, To Pay, To Ship, To Receive, To Pick Up, Completed, Cancelled.',
].join('\n');

/* ── Answers that read the buyer's own orders ──────────────────────── */

const TABS = [
  ['toPay', 'To Pay', { en: 'pay with **Pay now**', tl: 'magbayad gamit ang **Pay now**' }],
  ['toShip', 'To Ship', { en: 'the shop is confirming, checking your payment or packing', tl: 'kinukumpirma, sinusuri ang bayad mo, o iniimpake ng shop' }],
  ['toReceive', 'To Receive', { en: 'on the way, shipped or delivered: tap **Order received** once you have it', tl: 'papunta na, naipadala o na-deliver na: i-tap ang **Order received** kapag natanggap mo na' }],
  ['toPickUp', 'To Pick Up', { en: "ready at the shop's pickup spot", tl: 'handa na sa pickup spot ng shop' }],
];

const myOrders = (snap, lang = 'en') => {
  const tl = lang === 'tl';
  const o = snap.orders || {};
  const active = TABS.filter(([key]) => o[key] > 0);
  const lines = [];
  if (!active.length) {
    lines.push(tl
      ? 'Wala kang order na kasalukuyang inaasikaso. Nasa **Profile › My Orders** ang lahat ng order mo, kasama ang Completed at Cancelled.'
      : 'You have no orders in progress right now. All your orders are in **Profile › My Orders**, including Completed and Cancelled.');
  } else {
    lines.push(tl ? 'Ang mga order mo ngayon (**Profile › My Orders**):' : 'Your orders right now (**Profile › My Orders**):');
    for (const [key, label, hint] of active) lines.push(`- **${label}**: ${o[key]} — ${pick(hint, lang)}`);
    if (o.toPay > 0) {
      lines.push(tl
        ? 'Bayaran ang To Pay sa loob ng 48 oras matapos itong kumpirmahin ng shop, kung hindi ay kusa itong makakansela.'
        : 'Pay To Pay orders within 48 hours of the shop confirming them, or they are cancelled automatically.');
    }
  }
  if (snap.openReturns > 0) {
    lines.push(tl
      ? `May ${snap.openReturns} return request ka na bukas pa: tingnan sa **Profile › Returns & refunds**.`
      : `You have ${snap.openReturns} return request${snap.openReturns === 1 ? '' : 's'} still open: see **Profile › Returns & refunds**.`);
  }
  lines.push(tl
    ? 'Buksan ang **View details** sa isang order para sa buong progreso nito.'
    : 'Open **View details** on an order for its full progress.');
  return lines.join('\n');
};

const verifyId = (snap, lang = 'en') => {
  const tl = lang === 'tl';
  const steps = tl
    ? [
      'Para mag-verify: **Profile › Settings › Verify your identity**.',
      '1. Piliin ang uri ng ID (hal. PhilSys, Driver\'s License, UMID, Postal, Voter\'s, Passport).',
      '2. Kunan o i-upload ang harap ng ID (optional ang likod).',
      '3. I-tap ang **Verify identity**. Binabasa ang pangalan at ID number at itinutugma sa account mo.',
      'Hanggang 5 subok bawat araw. Hindi itinatabi ang litrato ng ID mo.',
    ]
    : [
      'To verify: **Profile › Settings › Verify your identity**.',
      '1. Choose your ID type (e.g. PhilSys, Driver\'s License, UMID, Postal, Voter\'s, Passport).',
      '2. Take or upload a photo of the front (the back is optional).',
      '3. Tap **Verify identity**. The name and ID number are read and matched to your account.',
      'Up to 5 tries a day. Your ID photo is not stored.',
    ];
  if (snap.verified) {
    return tl
      ? 'Naka-**verify** na ang identity mo, kaya makakapag-check out ka na. Kapag pinalitan mo ang pangalan mo, kailangan mong mag-verify ulit.'
      : 'Your identity is **verified**, so you can check out. If you change your name, you will need to verify again.';
  }
  const head = snap.verificationRequired
    ? (tl
      ? 'Kailangan munang i-verify ang identity mo bago ka makapag-check out. Pinoprotektahan nito ang mga lokal na shop laban sa pekeng order.'
      : 'You need to verify your identity before you can check out. It protects local shops from fake orders.')
    : (tl
      ? 'Optional ngayon ang pag-verify ng identity: makakapag-check out ka kahit hindi pa verified.'
      : 'Verifying your identity is optional right now: you can check out without it.');
  return [head, ...steps].join('\n');
};

/* ── Topics ────────────────────────────────────────────────────────── */

const TOPICS = [
  {
    id: 'how-to-buy',
    title: 'Buying something, step by step',
    keywords: ['buy', 'how to buy', 'order', 'place order', 'purchase', 'checkout', 'check out', 'buy now', 'add to cart', 'cart', 'options', 'variation', 'size', 'bumili', 'paano bumili', 'umorder', 'mag order', 'magorder', 'bilhin', 'basket'],
    related: ['payments', 'delivery', 'verify-id'],
    links: [{ label: 'Browse products', to: '/products' }],
    answer: {
      en: [
        'To buy something:',
        '1. On the product page tap **Buy now**, or the cart icon to add it to your **Cart**. Pick any options (size, weight…) in the sheet that opens.',
        '2. In **Cart**, tick the items and tap **Check out**. One shop per order: check out one shop at a time.',
        '3. At checkout choose **Delivery** or **Pickup**, your address or contact details, the payment method, and add **Order Notes** if you like.',
        '4. Tap **Place Order**. You will find it in **Profile › My Orders**.',
        'You need to be logged in, and your identity verified, to check out.',
      ].join('\n'),
      tl: [
        'Para bumili:',
        '1. Sa product page, i-tap ang **Buy now**, o ang cart icon para idagdag sa **Cart**. Piliin ang options (size, timbang…) sa sheet na lalabas.',
        '2. Sa **Cart**, i-tick ang mga item at i-tap ang **Check out**. Isang shop bawat order: isa-isang shop ang pag-check out.',
        '3. Sa checkout, piliin ang **Delivery** o **Pickup**, ang address o contact details mo, ang paraan ng pagbabayad, at maglagay ng **Order Notes** kung gusto mo.',
        '4. I-tap ang **Place Order**. Makikita mo ito sa **Profile › My Orders**.',
        'Kailangan naka-log in ka at verified ang identity mo para makapag-check out.',
      ].join('\n'),
    },
  },
  {
    id: 'payments',
    title: 'Paying: cash, GCash or QR Ph',
    keywords: ['pay', 'payment', 'paid', 'gcash', 'qr', 'qr ph', 'qrph', 'cod', 'cash', 'cash on delivery', 'pay now', 'reference', 'proof', 'screenshot', 'receipt', 'payment rejected', 'rejected', 'pay again', 'bank', 'bank transfer', 'bayad', 'magbayad', 'pagbabayad', 'nagbayad', 'bayaran'],
    related: ['my-orders', 'cancel', 'how-to-buy'],
    links: [{ label: 'My Orders', to: '/profile/orders?status=to_pay' }],
    answer: {
      en: [
        'Shops may offer **Cash on Delivery / Pickup**, **GCash (QR)** or **QR Ph**. You pay the shop directly; Emoorm adds no fee.',
        '- **Cash**: pay when your order is delivered or picked up. Not available with courier delivery.',
        '- **GCash / QR Ph**: nothing is paid at checkout. Once the shop confirms, the order moves to **To Pay**: tap **Pay now**, scan the shop\'s QR, then enter the reference number, upload a screenshot and tap **I have paid**.',
        'Pay within 48 hours of the shop confirming, or the order is cancelled. If the shop rejects your proof, tap **Pay again / resubmit proof**.',
        'Bank transfer is not available yet.',
      ].join('\n'),
      tl: [
        'Puwedeng mag-alok ang shop ng **Cash on Delivery / Pickup**, **GCash (QR)** o **QR Ph**. Diretso sa shop ang bayad mo; walang dagdag na singil ang Emoorm.',
        '- **Cash**: magbayad kapag na-deliver o na-pick up mo na ang order. Hindi puwede sa courier delivery.',
        '- **GCash / QR Ph**: walang babayaran sa checkout. Kapag kinumpirma ng shop, mapupunta ang order sa **To Pay**: i-tap ang **Pay now**, i-scan ang QR ng shop, ilagay ang reference number, mag-upload ng screenshot at i-tap ang **I have paid**.',
        'Magbayad sa loob ng 48 oras matapos kumpirmahin ng shop, kung hindi ay makakansela ang order. Kapag ni-reject ng shop ang proof mo, i-tap ang **Pay again / resubmit proof**.',
        'Hindi pa puwede ang bank transfer.',
      ].join('\n'),
    },
  },
  {
    id: 'delivery',
    title: 'Delivery, pickup and couriers',
    keywords: ['delivery', 'deliver', 'pickup', 'pick up', 'shipping', 'ship', 'delivery fee', 'fee', 'courier', 'rider', 'tracking', 'track', 'tracking number', 'parcel', 'address', 'does not deliver', 'padala', 'singil', 'kunin', 'kukunin', 'idedeliver', 'ihahatid', 'magkano delivery'],
    related: ['how-to-buy', 'my-orders', 'payments'],
    answer: {
      en: [
        'At checkout choose **Delivery** or **Pickup** (each only if the shop offers it).',
        '- **Delivery by the seller**: the shop sets where it delivers and the fee for your barangay or town. If it says "Does not deliver to your address", choose Pickup or change the address.',
        '- **Courier**: the fee depends on the parcel weight, and you pay online (GCash or QR Ph). Once shipped, the order shows the tracking number and a **Track your order here** link.',
        '- **Pickup** is free: collect it at the shop\'s pickup spot shown at checkout and in your order.',
      ].join('\n'),
      tl: [
        'Sa checkout, piliin ang **Delivery** o **Pickup** (kung inaalok ito ng shop).',
        '- **Delivery ng seller**: ang shop ang nagse-set kung saan sila nagde-deliver at ang singil para sa barangay o bayan mo. Kapag nakasulat na "Does not deliver to your address", piliin ang Pickup o palitan ang address.',
        '- **Courier**: depende sa timbang ng parcel ang singil, at online ang bayad (GCash o QR Ph). Kapag naipadala na, makikita sa order ang tracking number at ang **Track your order here** na link.',
        '- Libre ang **Pickup**: kunin ito sa pickup spot ng shop na nakalagay sa checkout at sa order mo.',
      ].join('\n'),
    },
  },
  {
    id: 'my-orders',
    title: "The buyer's orders and what they wait for",
    keywords: ['my order', 'my orders', 'where is my order', 'order status', 'status', 'to pay', 'to ship', 'to receive', 'to pick up', 'waiting', 'pending', 'confirmed', 'when will', 'arrive', 'track order', 'nasaan', 'order ko', 'mga order', 'kailan darating', 'dumating', 'my package', 'where is my package'],
    related: ['received', 'payments', 'cancel'],
    links: [{ label: 'My Orders', to: '/profile/orders' }],
    answer: myOrders,
    facts: 'My Orders (Profile › My Orders) tabs: To Pay (a GCash/QR Ph order the shop confirmed, to pay now), To Ship (waiting for the shop to confirm, payment being checked, or being packed), To Receive (on the way, shipped with a courier, or delivered), To Pick Up (ready at the pickup spot), Completed, Cancelled. The shop must confirm a new order within 48 hours or it is cancelled automatically. View details shows the full progress.',
  },
  {
    id: 'received',
    title: 'Confirming you got your order',
    keywords: ['order received', 'received', 'receive', 'got my order', 'complete', 'completed', 'finish order', 'confirm receipt', 'delivered', 'picked up', 'natanggap', 'nakuha ko na', 'dumating na'],
    related: ['reviews', 'returns', 'my-orders'],
    links: [{ label: 'To Receive', to: '/profile/orders?status=to_receive' }],
    answer: {
      en: [
        'When you have your order, tap **Order received** on it in **Profile › My Orders** and then **Yes, received**. For cash orders this also confirms you paid.',
        'The order becomes **Completed** and you can write a review.',
        'Delivered or shipped orders also complete on their own 7 days later, unless a return is open. The shop\'s hand-over photo is in the order\'s details.',
      ].join('\n'),
      tl: [
        'Kapag natanggap mo na ang order, i-tap ang **Order received** dito sa **Profile › My Orders** at pagkatapos ang **Yes, received**. Sa cash na order, kinukumpirma rin nito na nakapagbayad ka na.',
        'Magiging **Completed** ang order at puwede ka nang mag-review.',
        'Kusang nagiging completed ang mga na-deliver o naipadalang order pagkalipas ng 7 araw, maliban kung may bukas na return. Nasa details ng order ang litrato ng shop bilang patunay ng pag-abot.',
      ].join('\n'),
    },
  },
  {
    id: 'cancel',
    title: 'Cancelling an order',
    keywords: ['cancel', 'cancel order', 'cancelled', 'cancellation', 'change my mind', 'wrong order', 'i-cancel', 'icancel', 'mag cancel', 'kansela', 'ayaw ko na'],
    related: ['payments', 'returns', 'my-orders'],
    links: [{ label: 'My Orders', to: '/profile/orders' }],
    answer: {
      en: [
        'You can cancel while the shop is still confirming it or has just confirmed it: tap **Cancel order** on it in **Profile › My Orders**.',
        'Once the shop starts preparing it, you can no longer cancel; message the shop instead (**Contact seller**).',
        'If you already paid, the shop arranges your refund, and you are told when it is marked refunded. A voucher you used can be used again.',
      ].join('\n'),
      tl: [
        'Puwede kang mag-cancel habang kinukumpirma pa ito ng shop o kakakumpirma pa lang: i-tap ang **Cancel order** dito sa **Profile › My Orders**.',
        'Kapag sinimulan na itong ihanda ng shop, hindi na puwedeng i-cancel; i-message na lang ang shop (**Contact seller**).',
        'Kung nakapagbayad ka na, ang shop ang mag-aasikaso ng refund mo, at sasabihan ka kapag na-mark na itong refunded. Magagamit mo ulit ang voucher na ginamit mo.',
      ].join('\n'),
    },
  },
  {
    id: 'returns',
    title: 'Returns and refunds',
    keywords: ['return', 'returns', 'refund', 'refunds', 'damaged', 'broken', 'wrong item', 'missing', 'not as described', 'defective', 'money back', 'return request', 'ibalik', 'isauli', 'sira', 'mali', 'kulang', 'refund ko'],
    related: ['received', 'cancel', 'support'],
    links: [{ label: 'Returns & refunds', to: '/profile/returns' }],
    answer: {
      en: [
        'You can ask for a return within **7 days** after your order is delivered, picked up or completed:',
        '1. In **Profile › My Orders**, tap **Request return** on the order.',
        '2. Tick the items, choose what went wrong (Damaged item, Wrong item, Not as described, Missing item, Other), add details and up to 5 photos.',
        '3. Tap **Submit return request**.',
        'The shop approves or rejects it (with a reason), may ask you to ship the items back, and records your refund. Follow it in **Profile › Returns & refunds**; you can cancel it while it is still Requested.',
      ].join('\n'),
      tl: [
        'Puwede kang humiling ng return sa loob ng **7 araw** matapos ma-deliver, ma-pick up o ma-complete ang order mo:',
        '1. Sa **Profile › My Orders**, i-tap ang **Request return** sa order.',
        '2. I-tick ang mga item, piliin kung ano ang problema (Damaged item, Wrong item, Not as described, Missing item, Other), at maglagay ng detalye at hanggang 5 litrato.',
        '3. I-tap ang **Submit return request**.',
        'Ang shop ang mag-aapruba o magre-reject nito (may dahilan), puwedeng hilingin na ibalik mo ang mga item, at ito ang magtatala ng refund mo. Subaybayan ito sa **Profile › Returns & refunds**; puwede mo itong i-cancel habang Requested pa.',
      ].join('\n'),
    },
  },
  {
    id: 'vouchers',
    title: 'Vouchers',
    keywords: ['voucher', 'vouchers', 'code', 'promo', 'promo code', 'discount', 'coupon', 'sale', 'less', 'bawas', 'diskwento'],
    related: ['how-to-buy', 'payments'],
    answer: {
      en: [
        'Enter a voucher code in **Cart** (**Have a voucher?**) or at checkout (**Enter code**, then **Apply**).',
        'Vouchers are Emoorm codes: a percent or a fixed amount off the items (not the delivery fee). Some need a minimum order, and most can be used once per account.',
        'If an order with a voucher is cancelled, you can use the voucher again.',
      ].join('\n'),
      tl: [
        'Ilagay ang voucher code sa **Cart** (**Have a voucher?**) o sa checkout (**Enter code**, tapos **Apply**).',
        'Mga code ng Emoorm ang vouchers: porsiyento o tiyak na halaga na bawas sa mga item (hindi sa delivery fee). May mga kailangan ng minimum na order, at karamihan ay isang beses lang magagamit bawat account.',
        'Kapag na-cancel ang order na may voucher, magagamit mo ulit ang voucher.',
      ].join('\n'),
    },
  },
  {
    id: 'verify-id',
    title: 'Verifying your identity',
    keywords: ['verify', 'verification', 'verified', 'identity', 'id', 'valid id', 'government id', 'philsys', 'national id', 'why verify', 'not verified', 'cannot check out', "can't check out", 'checkout blocked', 'i-verify', 'iverify', 'beripika'],
    related: ['how-to-buy', 'account'],
    links: [{ label: 'Verify your identity', to: '/profile/verification' }],
    answer: verifyId,
    facts: 'Identity verification is needed to check out (unless Emoorm turns it off). Profile › Settings › Verify your identity: choose one of 14 Philippine IDs, photo of the front (back optional), tap Verify identity; the name and ID number are read and matched to the account. 5 tries a day; the ID photo is not stored; one ID per account; a municipal admin can also verify in person. Changing your name means verifying again.',
  },
  {
    id: 'find',
    title: 'Finding products and shops',
    keywords: ['find', 'search', 'look for', 'search by image', 'image search', 'photo search', 'camera', 'category', 'categories', 'filter', 'municipality', 'town', 'near me', 'local', 'stores', 'shops', 'price', 'cheapest', 'sort', 'hanapin', 'maghanap', 'saan makakabili', 'tindahan'],
    related: ['how-to-buy', 'chat'],
    links: [{ label: 'Search', to: '/search' }, { label: 'Stores', to: '/stores' }],
    answer: {
      en: [
        'Tap the search bar on Home to search products. In the results:',
        '- Sort by **Newest**, **Top Sales** or **Price** (tap again to switch low/high).',
        '- Filter by **Municipality**, **Category** or **Price**.',
        '- The camera icon is **Search by image**: upload a photo to find similar products.',
        'You can also browse **Shop by Category** and **Explore Municipals** on Home, or every shop in **Stores**.',
      ].join('\n'),
      tl: [
        'I-tap ang search bar sa Home para maghanap ng produkto. Sa results:',
        '- I-sort ayon sa **Newest**, **Top Sales** o **Price** (i-tap ulit para palitan ang mababa/mataas).',
        '- I-filter ayon sa **Municipality**, **Category** o **Price**.',
        '- Ang camera icon ay **Search by image**: mag-upload ng litrato para makahanap ng kahawig na produkto.',
        'Puwede ka ring tumingin sa **Shop by Category** at **Explore Municipals** sa Home, o sa lahat ng shop sa **Stores**.',
      ].join('\n'),
    },
  },
  {
    id: 'available-today',
    title: 'Available Today: fresh food for a limited time',
    keywords: ['available today', 'today only', 'fresh food', 'cooked food', 'made to order', 'pre-order', 'preorder', 'pre order', 'ready now', 'limited time', 'meal', 'meals', 'ulam', 'luto', 'kakanin', 'ngayong araw', 'sold out'],
    related: ['how-to-buy', 'delivery', 'cancel'],
    links: [{ label: 'Available Today', to: '/today' }],
    answer: {
      en: [
        'Available Today shows food and produce local shops have for a limited time: on Home, and in full at **Available Today**.',
        '- **Ready now**: already made. **Made to order**: cooked after you order. **Pre-order**: order now, ready later (like tomorrow morning).',
        '- Each one shows how long you can still order, when it is ready and how many are left. Once the time ends or it sells out, it can no longer be ordered.',
        "- Today items check out on their own (not with other items in your cart), by pickup or the shop's own delivery.",
        '- The shop confirms your order quickly; if it does not, the order cancels on its own.',
      ].join('\n'),
      tl: [
        'Ang Available Today ay mga pagkain at ani na meron ang mga lokal na shop sa limitadong oras: nasa Home, at kumpleto sa **Available Today**.',
        '- **Ready now**: luto na. **Made to order**: lulutuin pagka-order mo. **Pre-order**: umorder ngayon, handa mamaya o bukas.',
        '- Makikita sa bawat isa kung hanggang kailan puwedeng umorder, kailan ito handa at ilan na lang ang natitira. Kapag tapos na ang oras o naubos na, hindi na ito maoorder.',
        '- Hiwalay na nagche-checkout ang Today items (hindi kasama ang ibang item sa cart), pick up o delivery ng shop mismo.',
        '- Kinukumpirma agad ng shop ang order mo; kung hindi, kusa itong makakansela.',
      ].join('\n'),
    },
  },
  {
    id: 'special-products',
    title: 'Packages, paluto and live animals',
    keywords: ['package', 'packages', 'bundle', 'bundles', 'combo', "what's included", 'whats included', 'what is included', 'you save', 'how much do i save', 'do i save', 'paluto', 'cooked to order', 'cook to order', 'minimum order', 'min order', 'cooking days', 'live animal', 'live animals', 'livestock', 'per head', 'heads available', 'pig', 'goat', 'cow', 'carabao', 'native chicken', 'visit the farm', 'farm visit', 'baboy', 'kambing', 'baka', 'kalabaw', 'buhay na hayop', 'bawat ulo', 'kada ulo', 'pakete', 'lulutuin', 'kasama sa package', 'matitipid'],
    related: ['how-to-buy', 'delivery', 'my-orders'],
    links: [{ label: 'Browse products', to: '/products' }],
    answer: {
      en: [
        'Some products are sold in a special way:',
        '- **Packages**: several products from one shop at one price, like a Fiesta Food Package. The product page lists what is included (each item and how many), the package price and how much you save compared with buying each one.',
        '- **Paluto** (cooked to order): the shop cooks it after you order. The page shows how many it serves, how long it takes and any minimum order. A price "from ₱350" is the smallest size: pick a size to see its price. Order on one of the shop\'s cooking days before its order-by time and it is ready after the preparation time; otherwise it is ready on the next cooking day.',
        '- **Live animals** have an **asking price per head** and no fixed price: tap **Send offer**, choose the heads and your price, and talk it over with the seller in **Chat** (accept, decline or name another price; you can call the seller from the chat). Agreed, you meet to see the animals and pay in person; the seller marks it as done and you confirm it (it confirms itself after 3 days). Live animals are not added to the cart.',
        'Paluto, live animals and ready-to-eat food are not sent by courier: pick them up or choose the shop\'s own delivery. Some products are pickup only or delivery only.',
      ].join('\n'),
      tl: [
        'May mga produktong iba ang paraan ng pagbebenta:',
        '- **Package**: ilang produkto mula sa iisang shop sa iisang presyo, gaya ng Fiesta Food Package. Nakalista sa product page kung ano ang kasama (bawat item at ilan), ang presyo ng package at kung magkano ang matitipid mo kumpara sa isa-isang pagbili.',
        '- **Paluto** (lulutuin pagka-order): niluluto ito ng shop pagkatapos mong umorder. Makikita sa page kung ilang tao ang kasya, gaano katagal ito lutuin at kung may minimum order. Ang presyong "from ₱350" ay para sa pinakamaliit na size: pumili ng size para makita ang presyo nito. Kapag umorder ka sa araw ng pagluluto ng shop bago ang order-by time nito, handa ito pagkatapos ng preparation time; kung hindi, handa ito sa susunod nitong araw ng pagluluto.',
        '- **Buhay na hayop**: may **asking price bawat ulo** pero walang fixed na presyo: pindutin ang **Make an offer**, piliin kung ilang ulo at ang presyo mo, at pag-usapan ito ng seller sa **Chat** (tanggapin, tanggihan o magbigay ng ibang presyo; puwede mo ring tawagan ang seller mula sa chat). Kapag nagkasundo, magkita kayo para makita ang mga hayop at magbayad nang personal; ire-record ng seller ang benta at kukumpirmahin mo ito (kusa itong makukumpirma pagkalipas ng 3 araw). Hindi inilalagay sa cart ang buhay na hayop.',
        'Hindi ipinapadala sa courier ang paluto, buhay na hayop at ready-to-eat na pagkain: kunin ito o piliin ang delivery ng shop mismo. May mga produktong pickup lang o delivery lang.',
      ].join('\n'),
    },
    facts: 'Packages: several products of one shop at one price; the product page lists each item and how many, the package price and the saving against buying the items today; an order keeps a copy of what was inside; some packages must be ordered ahead (up to 14 days). Paluto (cooked to order): never out of stock; sizes can have their own prices, and "from ₱350" is the smallest; buyers cannot order fewer than its minimum order; ready time: on a cooking day before the order-by time, the preparation time after ordering, otherwise from 8:00 AM on the next cooking day. Live animals: an asking price per head, no fixed price and no cart or Buy now; the buyer taps Make an offer (heads and a price per head, from half the asking price up to it) and the deal is talked over in the chat with the seller (accept, decline, or name another price, any number of times; a Call button rings the seller); agreed, they meet, the buyer sees the animals and pays in person; the seller records the heads and total, and the buyer confirms it (or it confirms itself after 3 days), which makes it an order in My Orders. The page shows age, sex, approximate weight and the heads available; some farms allow a visit first. Paluto, live animals, ready-to-eat food and packages without a weight never go by courier: pickup or the shop\'s own delivery. A product can also be pickup only or delivery only.',
  },
  {
    id: 'chat',
    title: 'Messaging a shop',
    keywords: ['message', 'chat', 'contact', 'contact seller', 'ask the seller', 'talk to seller', 'seller', 'shop owner', 'inbox', 'messages', 'reply', 'kausapin', 'i-message', 'imessage', 'magtanong sa seller'],
    related: ['find', 'support'],
    links: [{ label: 'Messages', to: '/messages' }],
    answer: {
      en: [
        'Tap **Chat** on a product page, or **Message** on a shop\'s page. The chat is in the **Messages** tab.',
        'You can send text and photos, and attach a product or one of your orders so the shop knows what you mean. From an order, **Contact seller** opens the same chat.',
      ].join('\n'),
      tl: [
        'I-tap ang **Chat** sa product page, o ang **Message** sa page ng shop. Nasa **Messages** tab ang chat.',
        'Puwede kang magpadala ng text at litrato, at mag-attach ng produkto o isa sa mga order mo para malinaw sa shop. Mula sa order, binubuksan din ng **Contact seller** ang parehong chat.',
      ].join('\n'),
    },
  },
  {
    id: 'reviews',
    title: 'Reviews',
    keywords: ['review', 'reviews', 'rate', 'rating', 'stars', 'feedback', 'write review', 'edit review', 'delete review', 'i-review', 'ireview', 'marka'],
    related: ['received', 'returns'],
    links: [{ label: 'My Reviews', to: '/profile/reviews' }],
    answer: {
      en: [
        'You can review products from orders that are delivered, picked up or completed: one review per product, 1–5 stars, a comment, up to 5 photos and a video.',
        'Find them in **Profile › My Reviews** (**To review** and **My reviews**), or tap **Write review** on the order. You can edit the stars and comment, or delete a review.',
      ].join('\n'),
      tl: [
        'Puwede kang mag-review ng produkto mula sa mga order na na-deliver, na-pick up o completed na: isang review bawat produkto, 1–5 stars, komento, hanggang 5 litrato at isang video.',
        'Makikita ito sa **Profile › My Reviews** (**To review** at **My reviews**), o i-tap ang **Write review** sa order. Puwede mong i-edit ang stars at komento, o burahin ang review.',
      ].join('\n'),
    },
  },
  {
    id: 'saved',
    title: 'Wishlist and following shops',
    keywords: ['wishlist', 'save', 'saved', 'like', 'favorite', 'favourite', 'bookmark', 'follow', 'following', 'unfollow', 'followed stores', 'mute', 'shop updates', 'i-save', 'paborito', 'sundan'],
    related: ['find', 'account'],
    links: [{ label: 'Wishlist', to: '/profile/wishlist' }, { label: 'Followed Stores', to: '/profile/followed-stores' }],
    answer: {
      en: [
        '- **Wishlist**: tap the bookmark on a product to save it; see them in **Profile › Wishlist**. Your wishlist is kept on this device.',
        '- **Follow** a shop on its page to get its new products and promotions in Notifications. In **Profile › Followed Stores** you can mute or unmute each shop.',
      ].join('\n'),
      tl: [
        '- **Wishlist**: i-tap ang bookmark sa produkto para i-save ito; makikita sa **Profile › Wishlist**. Sa device na ito naka-save ang wishlist mo.',
        '- I-**Follow** ang isang shop sa page nito para makita sa Notifications ang mga bagong produkto at promo nito. Sa **Profile › Followed Stores**, puwede mong i-mute o i-unmute ang bawat shop.',
      ].join('\n'),
    },
  },
  {
    id: 'account',
    title: 'Your account, addresses and password',
    keywords: ['account', 'profile', 'name', 'photo', 'profile picture', 'contact number', 'phone number', 'address', 'addresses', 'default address', 'password', 'forgot password', 'reset password', 'email', 'settings', 'log out', 'logout', 'palitan', 'pangalan', 'numero'],
    related: ['verify-id', 'support'],
    links: [{ label: 'Settings', to: '/profile/settings' }, { label: 'My Addresses', to: '/profile/addresses' }],
    answer: {
      en: [
        '- **Profile › Settings**: Name & photo, Contact number, Home address, Verify your identity and Password. Your email can\'t be changed.',
        '- **Profile › My Addresses**: add, edit or delete addresses (Oriental Mindoro only) and choose your Default one for checkout.',
        '- Forgot your password? Tap **Forgot?** on the login page; the email link works for 1 hour.',
      ].join('\n'),
      tl: [
        '- **Profile › Settings**: Name & photo, Contact number, Home address, Verify your identity at Password. Hindi mapapalitan ang email mo.',
        '- **Profile › My Addresses**: magdagdag, mag-edit o magbura ng address (Oriental Mindoro lang) at piliin ang Default para sa checkout.',
        '- Nakalimutan ang password? I-tap ang **Forgot?** sa login page; 1 oras lang gumagana ang link sa email.',
      ].join('\n'),
    },
  },
  {
    id: 'support',
    title: 'Getting help and reporting a problem',
    keywords: ['help', 'support', 'admin', 'problem', 'complaint', 'scam', 'fraud', 'report', 'report shop', 'report product', 'fake', 'support case', 'customer service', 'reklamo', 'tulong', 'manloloko', 'i-report'],
    related: ['returns', 'chat'],
    links: [{ label: 'Help & Support', to: '/profile/support' }, { label: 'My Reports', to: '/profile/reports' }],
    answer: {
      en: [
        '- For help, open **Profile › Help & Support** and tap **New support case**: choose what it is about, add a subject and the details. Your municipal admin replies there.',
        '- To report a listing or a shop, use **Report listing** on the product page or **Report shop** in the shop\'s ⋯ menu. Follow your reports in **Profile › My Reports**.',
      ].join('\n'),
      tl: [
        '- Para humingi ng tulong, buksan ang **Profile › Help & Support** at i-tap ang **New support case**: piliin kung tungkol saan, maglagay ng subject at detalye. Doon sasagot ang municipal admin mo.',
        '- Para mag-report ng listing o shop, gamitin ang **Report listing** sa product page o ang **Report shop** sa ⋯ menu ng shop. Subaybayan ang mga report mo sa **Profile › My Reports**.',
      ].join('\n'),
    },
  },
  {
    id: 'sell',
    title: 'Selling on Emoorm',
    keywords: ['sell', 'selling', 'seller', 'open a shop', 'start a shop', 'my own shop', 'apply', 'become a seller', 'magbenta', 'magtinda', 'negosyo', 'sariling shop'],
    related: ['account', 'support'],
    links: [{ label: 'Sell on Emoorm', to: '/sell' }],
    answer: {
      en: 'Selling on Emoorm is free, with no commission. Open **Profile › Sell on Emoorm** and tap **Apply to sell**, then fill in your shop, business and payment details. Your shop stays private until your municipal admin approves it.',
      tl: 'Libre ang magbenta sa Emoorm, walang komisyon. Buksan ang **Profile › Sell on Emoorm** at i-tap ang **Apply to sell**, tapos punan ang detalye ng shop, negosyo at bayad. Private muna ang shop mo hangga\'t hindi pa ito naaaprubahan ng municipal admin.',
    },
  },
];

/** The suggested questions, in the order they are offered. */
const PRESETS = [
  { id: 'how-to-buy', topic: 'how-to-buy', question: { en: 'How do I buy something?', tl: 'Paano bumili?' } },
  { id: 'payments', topic: 'payments', question: { en: 'How do I pay with GCash or QR Ph?', tl: 'Paano magbayad gamit ang GCash o QR Ph?' } },
  { id: 'my-orders', topic: 'my-orders', question: { en: 'Where are my orders?', tl: 'Nasaan na ang mga order ko?' } },
  { id: 'cancel', topic: 'cancel', question: { en: 'How do I cancel an order?', tl: 'Paano mag-cancel ng order?' } },
  { id: 'returns', topic: 'returns', question: { en: 'How do I return an item?', tl: 'Paano mag-return ng item?' } },
  { id: 'delivery', topic: 'delivery', question: { en: 'How do delivery and pickup work?', tl: 'Paano ang delivery at pickup?' } },
  { id: 'verify-id', topic: 'verify-id', question: { en: 'Why do I need to verify my ID?', tl: 'Bakit kailangan i-verify ang ID ko?' } },
  { id: 'vouchers', topic: 'vouchers', question: { en: 'How do I use a voucher?', tl: 'Paano gamitin ang voucher?' } },
  { id: 'special-products', topic: 'special-products', question: { en: 'What are packages, paluto and live animals?', tl: 'Ano ang package, paluto at buhay na hayop?' } },
];

/** Words that make a question about shopping on Emoorm (normalized). */
const DOMAIN_WORDS = [
  'emoorm', 'moormy', 'shop', 'store', 'seller', 'sell', 'buy', 'buying', 'bought', 'purchase', 'order', 'cart', 'checkout',
  'check out', 'product', 'item', 'price', 'delivery', 'deliver', 'delivered', 'pickup', 'pick up', 'fee', 'shipping', 'ship',
  'shipped', 'courier', 'rider', 'tracking', 'track', 'parcel', 'address', 'barangay', 'payment', 'pay', 'paid', 'gcash', 'qr',
  'qr ph', 'qrph', 'cod', 'cash on delivery', 'cash', 'reference', 'proof', 'receipt', 'refund', 'return', 'cancel',
  'cancelled', 'received', 'review', 'rating', 'voucher', 'discount', 'promo', 'coupon', 'code', 'wishlist', 'follow',
  'chat', 'message', 'notification', 'verify', 'verification', 'identity', 'id', 'account', 'profile', 'password', 'login',
  'support', 'report', 'admin', 'search', 'category', 'municipality', 'town', 'stock', 'sold out', 'size', 'variation',
  'bumili', 'mamili', 'pamimili', 'produkto', 'tindahan', 'presyo', 'bayad', 'magbayad', 'pagbabayad', 'nagbayad',
  'padala', 'singil', 'resibo', 'order ko', 'ibalik', 'isauli', 'kansela', 'natanggap',
  'package', 'bundle', 'paluto', 'livestock', 'live animal', 'per head', 'buhay na hayop',
];

module.exports = {
  LANGS,
  pick,
  NAME,
  greeting,
  hello,
  ABOUT_ME,
  OFF_TOPIC_REPLY,
  NOT_SURE_REPLY,
  ADMIN_LINKS,
  OVERVIEW,
  TOPICS,
  PRESETS,
  DOMAIN_WORDS,
  TAGALOG_WORDS,
  GREETING,
  ABOUT_QUESTION,
  OFF_TOPIC_PATTERNS,
};
