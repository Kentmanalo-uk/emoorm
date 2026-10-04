/**
 * Ate Moormy's seller guide, in English and Tagalog: what the Seller Center
 * does, in the words the app shows. Each topic answers on its own (the
 * suggested questions, and typed questions when no model is set up) and is
 * what the model answers from. Every fact here comes from the app itself;
 * keep both languages in step when a screen or rule changes.
 *
 * The Tagalog is everyday Taglish, and keeps the app's button and page names
 * in English because that is how the screens show them.
 *
 * Places: phones have the tabs Home, Chat, Marketing and Me; computers have
 * the sidebar. Answers name the phone place first.
 */

const LANGS = ['en', 'tl'];

/** One text, in the language asked for (English when there is no other). */
const pick = (value, lang = 'en') => (
  value && typeof value === 'object' && !Array.isArray(value) ? (value[lang] ?? value.en) : value
);

const NAME = 'Ate Moormy';

const greeting = (name, lang = 'en') => (lang === 'tl'
  ? `Hi${name ? ` ${name}` : ''}! Ako si **Ate Moormy**, ang seller assistant mo sa Emoorm. Magtanong ka tungkol sa pagbebenta sa Emoorm: ang shop mo, mga produkto, order, delivery, bayad, returns at iba pa. Puwede mo ring i-tap ang isang tanong sa ibaba.`
  : `Hi${name ? ` ${name}` : ''}! I'm **Ate Moormy**, your Emoorm seller assistant. Ask me about selling on Emoorm: your shop, products, orders, delivery, payments, returns and more. You can also tap a question below.`);

const hello = (name, lang = 'en') => (lang === 'tl'
  ? `Hello${name ? ` ${name}` : ''}! Ano ang gusto mong malaman tungkol sa pagbebenta sa Emoorm?`
  : `Hello${name ? ` ${name}` : ''}! What would you like to know about selling on Emoorm?`);

const ABOUT_ME = {
  en: "I'm **Ate Moormy**, Emoorm's AI assistant for sellers. I can explain how the Seller Center works (products, orders, delivery, payments, returns, marketing and your earnings) and tell you what your shop still needs or what is waiting for you. I only answer questions about selling on Emoorm.",
  tl: 'Ako si **Ate Moormy**, ang AI assistant ng Emoorm para sa mga seller. Kaya kong ipaliwanag kung paano gumagana ang Seller Center (mga produkto, order, delivery, bayad, returns, marketing at kita mo) at sabihin kung ano pa ang kulang sa shop mo o ano ang naghihintay sa iyo. Tungkol lang sa pagbebenta sa Emoorm ang sinasagot ko.',
};

const OFF_TOPIC_REPLY = {
  en: 'Pasensya na, I can only help with selling on Emoorm: your shop, products, orders, delivery and pickup, payments, returns, marketing and the Seller Center. Try one of these:',
  tl: 'Pasensya na, tungkol lang sa pagbebenta sa Emoorm ang kaya kong sagutin: ang shop mo, mga produkto, order, delivery at pickup, bayad, returns, marketing at ang Seller Center. Subukan ang isa sa mga ito:',
};

const NOT_SURE_REPLY = {
  en: "I'm not sure about that one. Your municipal admin can help: on phones open **Me › Message the admin**; on computers open **Admin** in the sidebar.",
  tl: 'Hindi ako sigurado diyan. Matutulungan ka ng municipal admin mo: sa phone, buksan ang **Me › Message the admin**; sa computer, buksan ang **Admin** sa sidebar.',
};

const ADMIN_LINKS = [{ label: 'Message the admin', to: '/seller/support' }];

/** A map of the Seller Center, always given to the model. */
const OVERVIEW = [
  'Emoorm is free to sell on, takes no commission and never holds money: buyers pay the seller directly (cash, or the seller\'s GCash / QR Ph code).',
  'Phones: the Seller Center has tabs Home (tools: My products, My orders, Performance, Finance, Reviews, Returns, Decorate, Add product; and, until the shop is set up, the "Complete your shop" card with every setup step), Chat, Marketing and Me (Finance: My earnings; Delivery & payment: Delivery & pickup, Pickup spot, Delivery areas & fees, Payment options; Contact & help: Message the admin, Help center, Send feedback; Settings: Shop profile, Verify identity, Notifications, Language, Shop settings, Switch to my buyer account).',
  'Computers: the sidebar has Dashboard, My Orders, Returns & refunds, Messages, Admin, Products (All Products, Add New), Notifications, Reviews, Analytics, Finance, and My Shop (Shop Profile, Fulfillment & Payment, Settings, View Storefront).',
].join('\n');

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* ── Answers that read the seller's own shop ───────────────────────── */

const MISSING = {
  'delivery-areas': {
    text: {
      en: '**Choose where you deliver**: Me › Delivery & payment › Delivery areas & fees.',
      tl: '**Piliin kung saan ka nagde-deliver**: Me › Delivery & payment › Delivery areas & fees.',
    },
    link: { label: 'Delivery areas & fees', to: '/seller/fulfillment/delivery' },
  },
  'delivery-fee': {
    text: {
      en: '**Set your delivery fee**: on the same page, answer *How much is delivery?*',
      tl: '**I-set ang delivery fee mo**: sa parehong page, sagutin ang *How much is delivery?*',
    },
    link: { label: 'Delivery areas & fees', to: '/seller/fulfillment/delivery' },
  },
  pickup: {
    text: {
      en: '**Set your pickup spot**: Me › Delivery & payment › Pickup spot.',
      tl: '**I-set ang pickup spot mo**: Me › Delivery & payment › Pickup spot.',
    },
    link: { label: 'Pickup spot', to: '/seller/fulfillment/pickup' },
  },
  payment: {
    text: {
      en: '**Add a way to pay**: turn on cash, or add your GCash or QR Ph code in Me › Delivery & payment › Payment options.',
      tl: '**Magdagdag ng paraan ng pagbabayad**: i-on ang cash, o idagdag ang GCash o QR Ph code mo sa Me › Delivery & payment › Payment options.',
    },
    link: { label: 'Payment options', to: '/seller/fulfillment/payment' },
  },
};

const missingList = (snap, lang) => snap.missing.map((key, i) => `${i + 1}. ${pick(MISSING[key]?.text, lang) || key}`);

const NO_SHOP = {
  en: "You don't have a shop yet. Tap **Apply to sell** on the Sell on Emoorm page to open one; your shop stays private until your municipal admin approves it.",
  tl: 'Wala ka pang shop. I-tap ang **Apply to sell** sa Sell on Emoorm page para magbukas; private muna ang shop mo hangga\'t hindi pa ito naaaprubahan ng municipal admin.',
};

const uniqueLinks = (links) => links.filter((l, i) => links.findIndex((x) => x.to === l.to) === i);

const startSelling = (snap, lang = 'en') => {
  if (!snap.store) return pick(NO_SHOP, lang);
  const s = snap.store;
  const tl = lang === 'tl';
  const lines = [];
  if (s.suspended) {
    lines.push(tl
      ? 'Naka-**suspend** ang shop mo ng admin, kaya hindi makakaorder ang mga buyer. Mag-message sa admin para malaman kung bakit.'
      : 'Your shop is **suspended** by an admin, so buyers can\'t order. Message the admin to find out why.');
  }
  if (snap.readyToSell) {
    lines.push(tl
      ? '**Ready to sell** na ang shop mo: naka-set na ang delivery o pickup, at ang paraan ng pagbabayad.'
      : 'Your shop is **ready to sell**: delivery or pickup, and a way to pay, are all set.');
    if (!snap.liveProducts) {
      lines.push(tl
        ? 'Susunod, **magdagdag ng unang produkto** para may ma-order ang mga buyer (Home › Add product).'
        : 'Next, **add your first product** so buyers have something to order (Home › Add product).');
    } else {
      lines.push(tl
        ? `Puwede nang umorder ang mga buyer sa ${snap.liveProducts} live na produkto mo. Para maabot ang mas marami, subukan ang **Marketing › Announce** o **Promote a product**.`
        : `Buyers can order your ${plural(snap.liveProducts, 'live product')}. To reach more of them, try **Marketing › Announce** or **Promote a product**.`);
    }
  } else {
    lines.push(tl ? 'Hindi pa makakaorder ang mga buyer sa shop mo. Kulang pa:' : "Buyers can't order from your shop yet. Still needed:");
    lines.push(...missingList(snap, lang));
    lines.push(tl ? 'Nakikita na ng mga buyer ang mga produkto mo; makakaorder sila kapag natapos ang mga ito.' : 'Buyers can already see your products; they can order once these are done.');
  }
  if (!s.approved) {
    lines.push(tl
      ? '**Private** din ang shop mo hangga\'t hindi pa ito naaaprubahan ng municipal admin (karaniwang 1–2 business days). Puwede mo pa ring ituloy ang pag-set up habang naghihintay.'
      : 'Your shop is also **private** until your municipal admin approves it (usually 1–2 business days). You can keep setting it up meanwhile.');
  }
  if (!s.open) {
    lines.push(tl
      ? 'Naka-**Inactive** ang shop mo. I-on ito sa Me › Shop profile › Name & description.'
      : 'Your shop is turned **Inactive**. Turn it on in Me › Shop profile › Name & description.');
  }
  return lines.join('\n');
};

const startSellingLinks = (snap) => {
  if (!snap.store) return [{ label: 'Apply to sell', to: '/seller/apply' }];
  const links = snap.readyToSell
    ? (snap.liveProducts ? [] : [{ label: 'Add product', to: '/seller/products/new' }])
    : snap.missing.map((key) => MISSING[key]?.link).filter(Boolean);
  return uniqueLinks([...links, { label: 'Complete your shop', to: '/seller' }]).slice(0, 3);
};

/** What can be waiting on a seller: [key, English, Tagalog, link]. */
const WAITING = [
  ['pendingOrders', (n) => `**${plural(n, 'new order')}** to confirm`, (n) => `**${n} bagong order** na kailangang i-confirm`, { label: 'My orders', to: '/seller/orders' }],
  ['openReturns', (n) => `**${plural(n, 'return request')}** to review`, (n) => `**${n} return request** na kailangang i-review`, { label: 'Returns & refunds', to: '/seller/returns' }],
  ['unreadMessages', (n) => `**${plural(n, 'unread buyer chat')}**`, (n) => `**${n} hindi pa nababasang chat** ng buyer`, { label: 'Chat', to: '/seller/messages' }],
  ['adminMessages', (n) => `**${plural(n, 'unread message')}** from the admin`, (n) => `**${n} hindi pa nababasang message** mula sa admin`, { label: 'Admin messages', to: '/seller/support' }],
  ['lowStock', (n) => `**${plural(n, 'product')}** low on stock`, (n) => `**${n} produkto** na paubos na ang stock`, { label: 'My products', to: '/seller/products' }],
];

const today = (snap, lang = 'en') => {
  if (!snap.store) return pick(NO_SHOP, lang);
  const tl = lang === 'tl';
  const items = WAITING
    .filter(([key]) => snap.waiting[key] > 0)
    .map(([key, en, tagalog]) => (tl ? tagalog : en)(snap.waiting[key]));
  if (snap.readyToSell === false) {
    items.unshift(tl ? '**Tapusin ang shop setup**: hindi pa makakaorder ang mga buyer' : "**Finish your shop setup**: buyers can't order yet");
  }
  if (!items.length) {
    return tl
      ? 'Wala kang kailangang asikasuhin ngayon. Magandang pagkakataon ito para magdagdag ng produkto, sumagot sa reviews, o magpadala ng announcement sa followers mo mula sa **Marketing**.'
      : 'Nothing is waiting on you right now. A good time to add products, reply to reviews, or send your followers an announcement from **Marketing**.';
  }
  return [
    tl ? 'Ito ang naghihintay sa iyo:' : "Here's what's waiting for you:",
    ...items.map((item) => `- ${item}`),
    tl
      ? 'I-confirm ang mga bagong order sa loob ng 48 oras: kusang nakakansela ang mga hindi na-confirm.'
      : 'Confirm new orders within 48 hours: orders left unconfirmed are cancelled automatically.',
  ].join('\n');
};

const todayLinks = (snap) => {
  if (!snap.store) return [];
  const links = WAITING.filter(([key]) => snap.waiting[key] > 0).map(([, , , link]) => link);
  if (snap.readyToSell === false) links.unshift({ label: 'Complete your shop', to: '/seller' });
  return links.slice(0, 3);
};

const notShowing = (snap, lang = 'en') => {
  if (!snap.store) return pick(NO_SHOP, lang);
  const s = snap.store;
  const tl = lang === 'tl';
  if (s.suspended) {
    return tl
      ? 'Naka-**suspend** ang shop mo ng admin, kaya nakatago ito sa mga buyer. Mag-message sa admin para malaman kung bakit; makakatanggap ka ng "Your store is active again" kapag inalis na ito.'
      : 'Your shop is **suspended** by an admin, so it is hidden from buyers. Message the admin to find out why; you\'ll get "Your store is active again" when it\'s lifted.';
  }
  if (!s.approved) {
    return tl
      ? '**Private** ang shop mo hangga\'t hindi pa ito naaaprubahan ng municipal admin (karaniwang 1–2 business days), kaya hindi pa ito nakikita ng mga buyer. Puwede ka pa ring magdagdag ng produkto; lalabas ang mga ito kapag naaprubahan ka na.'
      : 'Your shop is **private** until your municipal admin approves it (usually 1–2 business days), so buyers can\'t see it yet. You can keep adding products meanwhile; they show once you\'re approved.';
  }
  if (!s.open) {
    return tl
      ? 'Naka-**Inactive** ang shop mo, kaya nakatago ito at ang mga produkto nito. I-on ito sa Me › Shop profile › Name & description (sa computer: ang **Store is Active** switch sa Shop Profile).'
      : 'Your shop is turned **Inactive**, which hides it and its products. Turn it on in Me › Shop profile › Name & description (computers: the **Store is Active** switch in Shop Profile).';
  }
  if (!snap.products) {
    return tl
      ? 'Wala ka pang produkto. I-tap ang **Home › Add product** (sa computer: **Products › Add New**); live agad ang mga bagong produkto.'
      : "You haven't added any products yet. Tap **Home › Add product** (computers: **Products › Add New**); new products go live right away.";
  }
  // Buyers see the products either way; a shop that is not ready to sell
  // only cannot take orders yet.
  const orderNote = snap.readyToSell === false
    ? [
      tl
        ? 'Pero hindi pa makakaorder ang mga buyer dahil hindi pa ready to sell ang shop mo. Kulang pa:'
        : "Buyers can't order yet, though: your shop isn't ready to sell. Still needed:",
      ...missingList(snap, lang),
    ]
    : [];
  if (snap.liveProducts < snap.products) {
    return [tl
      ? `${snap.liveProducts} sa ${snap.products} produkto mo ang live. Ang iba ay maaaring **hidden** (i-tap ang Show), **suspended** ng admin, o **archived**. Tingnan ang mga tab sa **My products**.`
      : `${snap.liveProducts} of your ${plural(snap.products, 'product')} ${snap.liveProducts === 1 ? 'is' : 'are'} live. The others may be **hidden** (tap Show), **suspended** by an admin, or **archived**. Check the tabs in **My products**.`, ...orderNote].join('\n');
  }
  return [tl
    ? `Live ang shop mo at lahat ng ${snap.products} produkto mo. Nakikita sila ng mga buyer sa search, categories at shop page mo. Makakatulong ang malinaw na litrato, magandang pangalan at patas na delivery fee.`
    : `Your shop and all ${plural(snap.products, 'product')} are live. Buyers find them through search, categories and your shop page. Clear photos, good names and fair delivery fees help them stand out.`, ...orderNote].join('\n');
};

const notShowingLinks = (snap) => {
  if (!snap.store) return [{ label: 'Apply to sell', to: '/seller/apply' }];
  if (snap.store.suspended) return ADMIN_LINKS;
  if (!snap.store.open) return [{ label: 'Name & description', to: '/seller/store/about' }];
  if (!snap.products) return [{ label: 'Add product', to: '/seller/products/new' }];
  if (snap.readyToSell === false) return uniqueLinks([...snap.missing.map((k) => MISSING[k]?.link).filter(Boolean), { label: 'Complete your shop', to: '/seller' }]).slice(0, 3);
  return [{ label: 'My products', to: '/seller/products' }];
};

/* ── The topics ────────────────────────────────────────────────────── */

const TOPICS = [
  {
    id: 'start-selling',
    title: 'What a shop needs before buyers can order',
    keywords: ['start selling', 'ready to sell', 'get started', 'start', 'begin', 'setup', 'set up', 'checklist', 'go live', 'live', 'open my shop', 'first time', 'magsimula', 'simulan', 'umpisa', 'ready', 'paano magbenta', 'makapagbenta', 'kulang', 'ano pa kulang'],
    related: ['delivery', 'payments', 'add-product'],
    answer: startSelling,
    links: startSellingLinks,
    facts: 'A shop is ready to sell when: if it delivers, it has at least one delivery area and a fee decided for every area; if it offers pickup, it has a pickup spot; and buyers have a way to pay (cash on, or a QR uploaded). Until then buyers can see its products, but checkout says "This shop isn\'t taking orders yet." Orders open by themselves once the shop is ready. The "Complete your shop" card on Home lists every step (computers: the setup card on the Dashboard opens the next one): logo and banner, description and map pin, delivery areas, delivery fees, pickup spot, payment QR (optional while cash is on), first product, verify identity and get approved. Verifying the ID is not needed to sell, but admins approve verified shops faster. A new shop is private until the municipal admin approves it, usually in 1–2 business days.',
  },
  {
    id: 'today',
    title: 'What is waiting on the seller',
    keywords: ['today', 'attention', 'waiting', 'to do', 'todo', 'next', 'what should i do', 'pending', 'gagawin', 'ngayon', 'unread', 'badge', 'asikasuhin', 'ngayong araw'],
    related: ['new-order', 'returns', 'not-showing'],
    answer: today,
    links: todayLinks,
    facts: 'Home (phones) counts orders To confirm and To ship, Returns and Reviews. The sidebar badges count new orders to confirm, return requests to review, unread buyer chats, unread admin messages and products low on stock. New orders must be confirmed within 48 hours or they are cancelled automatically.',
  },
  {
    id: 'add-product',
    title: 'Adding a product',
    keywords: ['add product', 'add a product', 'new product', 'add item', 'list', 'listing', 'post product', 'upload product', 'photos', 'photo', 'picture', 'category', 'description', 'magdagdag', 'produkto', 'mag post', 'choices', 'variation', 'variations', 'size', 'weight', 'ilagay', 'maglagay', 'bagong produkto', 'litrato'],
    related: ['not-showing', 'more-sales', 'new-order'],
    links: [{ label: 'Add product', to: '/seller/products/new' }],
    answer: {
      en: [
        'To add a product:',
        '1. On phones tap **Home › Add product** (computers: **Products › Add New**).',
        '2. **Photos**: up to 10 (JPEG, PNG or WebP, up to 5 MB each). The first one is the cover.',
        '3. **About the product**: a name, a category and a description (at least 10 characters).',
        '4. **Choices** (optional): e.g. Size, Weight or Color; one type can have its own price per choice and one its own stock.',
        '5. **Price and stock**, then **Returns** (optional: no returns, 7-day returns, perishable goods, or your own words).',
        '6. Tap **Add product**.',
        'New products go live right away, with no admin review. Buyers can order them once your shop is ready to sell.',
      ].join('\n'),
      tl: [
        'Para magdagdag ng produkto:',
        '1. Sa phone, i-tap ang **Home › Add product** (sa computer: **Products › Add New**).',
        '2. **Photos**: hanggang 10 (JPEG, PNG o WebP, hanggang 5 MB bawat isa). Ang una ang cover.',
        '3. **About the product**: pangalan, category at description (hindi bababa sa 10 characters).',
        '4. **Choices** (optional): hal. Size, Weight o Color; may isang uri na puwedeng may sariling presyo bawat choice, at isa na may sariling stock.',
        '5. **Price and stock**, tapos **Returns** (optional: walang returns, 7-day returns, perishable goods, o sarili mong salita).',
        '6. I-tap ang **Add product**.',
        'Live agad ang mga bagong produkto, walang review ng admin. Makakaorder ang mga buyer kapag ready to sell na ang shop mo.',
      ].join('\n'),
    },
  },
  {
    id: 'edit-product',
    title: 'Editing, hiding, deleting and restocking products',
    keywords: ['edit product', 'change price', 'update price', 'price', 'edit', 'hide', 'unhide', 'show product', 'delete product', 'remove product', 'stock', 'restock', 'add stock', 'out of stock', 'low stock', 'inventory', 'my products', 'suspended product', 'pending approval', 'archived', 'presyo', 'palitan ang presyo', 'itago', 'burahin', 'dagdag stock', 'ubos', 'paubos'],
    related: ['add-product', 'not-showing', 'today'],
    links: [{ label: 'My products', to: '/seller/products' }],
    answer: {
      en: [
        'In **My products** (phones: Home › My products; computers: Products › All Products):',
        '- **Edit** changes the photos, price, choices or description.',
        '- **Hide** takes a product off your shop without deleting it; **Show** brings it back (once your shop is ready to sell).',
        '- **Add stock**: phones have +5, +10, +20 and +50 buttons; products with stock per choice use **Edit stock**.',
        "- **Delete** removes a product for good; it can't be undone.",
        'A **Low stock** badge shows when stock is 5 or less. Select several products to hide, show or delete them at once. If an admin suspends a product you\'ll see the reason; editing it sends it back for approval.',
      ].join('\n'),
      tl: [
        'Sa **My products** (phone: Home › My products; computer: Products › All Products):',
        '- **Edit** para palitan ang photos, presyo, choices o description.',
        '- **Hide** para itago ang produkto sa shop nang hindi binubura; **Show** para ibalik ito (kapag ready to sell na ang shop mo).',
        '- **Add stock**: sa phone may +5, +10, +20 at +50 na buttons; ang mga produktong may stock bawat choice ay gumagamit ng **Edit stock**.',
        '- **Delete** para burahin ang produkto nang tuluyan; hindi na ito maibabalik.',
        'May **Low stock** badge kapag 5 o mas kaunti na lang ang stock. Puwede kang pumili ng ilang produkto para sabay-sabay i-hide, i-show o i-delete. Kapag sinuspend ng admin ang isang produkto, makikita mo ang dahilan; kapag in-edit mo ito, babalik ito para sa approval.',
      ].join('\n'),
    },
  },
  {
    id: 'available-today',
    title: 'Available Today: selling fresh food for a limited time',
    keywords: ['available today', "today's menu", 'todays menu', 'today menu', 'fresh food', 'cooked food', 'made to order', 'pre-order', 'preorder', 'pre order', 'limited time', 'ready now', 'meal', 'meals', 'ulam', 'luto', 'lutong bahay', 'kakanin', 'harvest', 'ani', 'post today', 'sell today', 'ngayong araw lang'],
    related: ['add-product', 'new-order', 'delivery'],
    links: [{ label: "Today's menu", to: '/seller/today' }, { label: 'Add product', to: '/seller/products/new' }],
    answer: {
      en: [
        'Available Today is for things you have on some days only: cooked food, baked goods, fresh catch or harvests.',
        '1. Add the product (or edit it) and under **Price and stock › How you sell it** choose **Available Today**. It has no stock of its own.',
        "2. Open **Today's menu** (phones: Home › Today's menu; computers: Products › Today's menu) and tap **Post an item**.",
        '3. Pick the kind: **Ready now**, **Made to order** (say how many minutes it takes) or **Pre-order** (ready later, like tomorrow morning). Enter how many you have and until when buyers can order.',
        'Buyers order until the time ends or it sells out. While it is on you can add or take away, give it more time, or end it. Afterwards, **Post again** puts it up for today or tomorrow at the same times.',
        'Confirm these orders quickly: within 45 minutes (pre-orders: up to an hour after orders close), or they cancel on their own. Couriers do not carry Today items: buyers pick up or you deliver.',
      ].join('\n'),
      tl: [
        'Ang Available Today ay para sa mga paninda na meron ka lang sa ilang araw: lutong ulam, tinapay at kakanin, sariwang huli o ani.',
        '1. Idagdag ang produkto (o i-edit ito) at sa **Price and stock › How you sell it** piliin ang **Available Today**. Wala itong sariling stock.',
        "2. Buksan ang **Today's menu** (phone: Home › Today's menu; computer: Products › Today's menu) at i-tap ang **Post an item**.",
        '3. Piliin ang uri: **Ready now**, **Made to order** (ilagay kung ilang minuto ang paggawa) o **Pre-order** (handa mamaya o bukas). Ilagay kung ilan ang meron ka at hanggang kailan puwedeng umorder.',
        'Makakaorder ang mga buyer hanggang matapos ang oras o maubos ito. Habang bukas, puwede kang magdagdag o magbawas, magdagdag ng oras, o tapusin ito. Pagkatapos, ang **Post again** ay ipo-post ulit ito ngayon o bukas sa parehong oras.',
        'Kumpirmahin agad ang mga order na ito: sa loob ng 45 minuto (pre-order: hanggang isang oras matapos magsara ang order), kung hindi ay kusa itong makakansela. Hindi dinadala ng courier ang Today items: pick up ng buyer o ikaw ang magde-deliver.',
      ].join('\n'),
    },
    facts: "Available Today products (How you sell it: Available Today) have no stock of their own and are hidden from buyers between posts. A post (Today's menu) has a kind (Ready now, Made to order with minutes to make, Pre-order with its own ready time), how many, when orders open (now or up to 30 days ahead) and close (at most 7 days later), a ready time (at most 3 days), pickup and/or delivery within what the shop offers, and an optional note. One post per product at a time. Orders: checked out on their own (not with other items), one ready day per order, no couriers; the seller confirms within 45 minutes (pre-orders up to 1 hour after orders close, never later than the ready time ends) or the order cancels and the units go back. Followers are told when the shop posts, at most once every 3 hours. Admins can turn Available Today off.",
  },
  {
    id: 'new-order',
    title: 'Handling an order, step by step',
    keywords: ['new order', 'order', 'confirm', 'confirm order', 'prepare', 'preparing', 'to ship', 'ship', 'out for delivery', 'delivered', 'mark delivered', 'complete', 'completed', 'order status', 'proof of delivery', 'fulfil', 'fulfill', 'process order', 'bagong order', 'picked up', 'kumpirmahin', 'i confirm', 'ipadala'],
    related: ['payments', 'returns', 'today'],
    links: [{ label: 'My orders', to: '/seller/orders' }],
    answer: {
      en: [
        'When a new order comes in (**My orders › New**):',
        '1. **Confirm Order** within 48 hours, or it is cancelled automatically.',
        "2. GCash / QR Ph orders: check the payment proof and tap **Payment received** (or **Reject payment**). You can't ship until the payment is verified.",
        '3. Delivery: **Start Preparing** (optional) › **Mark Ready to Ship** › **Out for Delivery** › **Mark Delivered** with a proof-of-delivery photo.',
        '4. Pickup: **Ready for Pickup** › **Mark Picked Up** with a proof photo.',
        '5. **Mark Completed**, or the buyer completes it by confirming they got the order.',
        'Cash on delivery orders are marked paid when they are delivered or picked up.',
      ].join('\n'),
      tl: [
        'Kapag may bagong order (**My orders › New**):',
        '1. **Confirm Order** sa loob ng 48 oras, kung hindi ay kusa itong makakansela.',
        '2. Sa GCash / QR Ph na order: tingnan ang payment proof at i-tap ang **Payment received** (o **Reject payment**). Hindi ka makakapag-ship hangga\'t hindi pa verified ang bayad.',
        '3. Delivery: **Start Preparing** (optional) › **Mark Ready to Ship** › **Out for Delivery** › **Mark Delivered** kasama ang litrato bilang proof of delivery.',
        '4. Pickup: **Ready for Pickup** › **Mark Picked Up** kasama ang proof na litrato.',
        '5. **Mark Completed**, o ang buyer mismo ang magko-complete kapag kinumpirma niyang natanggap niya ang order.',
        'Ang mga cash on delivery na order ay nagiging paid kapag na-deliver o na-pick up na.',
      ].join('\n'),
    },
  },
  {
    id: 'verify-payment',
    title: 'Checking GCash / QR Ph payments',
    keywords: ['verify payment', 'verify', 'check payment', 'confirm payment', 'payment from gcash', 'proof of payment', 'buyer paid', 'did the buyer pay', 'payment proof', 'proof', 'reference', 'reference number', 'screenshot', 'receipt', 'payment received', 'reject payment', 'payment to verify', 'fake payment', 'not paid', 'awaiting new proof', 'na bayaran', 'nagbayad', 'bayad na', 'nagbayad na'],
    related: ['new-order', 'payments', 'returns'],
    links: [{ label: 'My orders', to: '/seller/orders' }],
    answer: {
      en: [
        'For GCash / QR Ph orders the buyer enters a **reference number** and uploads a **payment proof** screenshot.',
        '1. Open the order (it shows **Payment to verify**).',
        '2. Check that the money reached your GCash or bank account.',
        '3. Tap **Payment received**. If it didn\'t arrive, tap **Reject payment**: the order stays and the buyer is asked for new proof (**Awaiting new proof**).',
        "You can confirm an order before checking the payment, but you can't fulfil it until the payment is verified. Emoorm never holds the money: buyers pay you directly.",
      ].join('\n'),
      tl: [
        'Sa GCash / QR Ph na order, naglalagay ang buyer ng **reference number** at nag-a-upload ng screenshot bilang **payment proof**.',
        '1. Buksan ang order (nakasulat ang **Payment to verify**).',
        '2. Tingnan kung pumasok ang pera sa GCash o bank account mo.',
        '3. I-tap ang **Payment received**. Kung hindi pumasok, i-tap ang **Reject payment**: mananatili ang order at hihingan ng bagong proof ang buyer (**Awaiting new proof**).',
        'Puwede mong i-confirm ang order bago tingnan ang bayad, pero hindi mo ito maipapadala hangga\'t hindi pa verified ang bayad. Hindi humahawak ng pera ang Emoorm: direkta kang binabayaran ng mga buyer.',
      ].join('\n'),
    },
  },
  {
    id: 'cancel-order',
    title: 'Cancelling orders, expiry and refunds due',
    keywords: ['cancel', 'cancel order', 'cancel an order', 'cancel the order', 'cancelled', 'cancellation', 'expire', 'expired', '48 hours', 'refund due', 'mark refunded', 'kanselahin', 'buyer cancelled', 'i cancel', 'mag cancel', 'nakansela'],
    related: ['new-order', 'returns', 'today'],
    links: [{ label: 'My orders', to: '/seller/orders' }],
    answer: {
      en: [
        '- You can **Cancel Order** at any step before it is delivered or picked up; the stock goes back.',
        '- Buyers can cancel only while the order is New or Confirmed.',
        '- New orders you don\'t confirm within 48 hours are cancelled automatically (not while a payment proof is waiting for you to check).',
        '- Cancelling a prepaid order you already verified shows **Refund due**: send the money back, then tap **Mark refunded**.',
        'Many cancellations (30% or more of at least 3 orders in 30 days) put your shop health at **Needs attention**.',
      ].join('\n'),
      tl: [
        '- Puwede mong i-**Cancel Order** sa anumang hakbang bago ito ma-deliver o ma-pick up; babalik ang stock.',
        '- Ang buyer ay makakapag-cancel lang habang New o Confirmed pa ang order.',
        '- Kusang nakakansela ang mga bagong order na hindi mo na-confirm sa loob ng 48 oras (maliban kung may payment proof na naghihintay na tingnan mo).',
        '- Kapag kinansela mo ang prepaid na order na na-verify mo na, lalabas ang **Refund due**: ibalik ang pera, tapos i-tap ang **Mark refunded**.',
        'Kapag marami ang cancellation (30% o higit pa sa hindi bababa sa 3 order sa loob ng 30 araw), magiging **Needs attention** ang shop health mo.',
      ].join('\n'),
    },
  },
  {
    id: 'delivery',
    title: 'Delivery areas and fees',
    keywords: ['delivery', 'deliver', 'delivery area', 'delivery areas', 'delivery fee', 'fee', 'shipping', 'shipping fee', 'barangay', 'town', 'towns', 'municipality', 'all around mindoro', 'free delivery', 'where do you deliver', 'courier', 'rider', 'padala', 'singil', 'sf', 'bayan', 'magkano ang delivery', 'saan ako nagde deliver', 'libreng delivery'],
    related: ['payments', 'start-selling', 'new-order'],
    links: [{ label: 'Delivery areas & fees', to: '/seller/fulfillment/delivery' }],
    answer: {
      en: [
        'Open **Me › Delivery & payment › Delivery areas & fees** (computers: **My Shop › Fulfillment & Payment**) and answer two questions:',
        '1. **Where do you deliver?** Only in your town, some towns, or all around Mindoro. In each town choose all barangays or only some.',
        '2. **How much is delivery?** Free delivery, the same fee everywhere, or a fee for each town or barangay (₱0 to ₱10,000; each can be Free).',
        'Buyers pay the fee for their barangay or town, otherwise your standard fee. Pickup is always free. Buyers outside your areas can only choose pickup.',
      ].join('\n'),
      tl: [
        'Buksan ang **Me › Delivery & payment › Delivery areas & fees** (sa computer: **My Shop › Fulfillment & Payment**) at sagutin ang dalawang tanong:',
        '1. **Where do you deliver?** Sa bayan mo lang, sa ilang bayan, o sa buong Mindoro. Sa bawat bayan, piliin kung lahat ng barangay o ilan lang.',
        '2. **How much is delivery?** Libreng delivery, parehong fee kahit saan, o fee para sa bawat bayan o barangay (₱0 hanggang ₱10,000; puwedeng Free ang bawat isa).',
        'Ang fee ng barangay o bayan ng buyer ang binabayaran niya; kung wala, ang standard fee mo. Laging libre ang pickup. Ang mga buyer na nasa labas ng areas mo ay pickup lang ang mapipili.',
      ].join('\n'),
    },
  },
  {
    id: 'pickup',
    title: 'Pickup and how buyers get orders',
    keywords: ['pickup', 'pick up', 'pickup spot', 'pickup address', 'pickup instructions', 'delivery or pickup', 'both', 'delivery only', 'pickup only', 'meet up', 'kunin', 'claim', 'kukunin'],
    related: ['delivery', 'new-order', 'payments'],
    links: [
      { label: 'Delivery & pickup', to: '/seller/fulfillment/method' },
      { label: 'Pickup spot', to: '/seller/fulfillment/pickup' },
    ],
    answer: {
      en: [
        'Choose how buyers get their orders in **Me › Delivery & payment › Delivery & pickup**: **Delivery only**, **Pickup only**, or **Both**.',
        'If you offer pickup, set your **Pickup spot** (town, barangay, and a street or landmark) and optional pickup instructions.',
        'Pickup orders go **Ready for Pickup** › **Mark Picked Up** (with a proof photo) › **Mark Completed**. Pickup is free for buyers.',
      ].join('\n'),
      tl: [
        'Piliin kung paano makukuha ng mga buyer ang order sa **Me › Delivery & payment › Delivery & pickup**: **Delivery only**, **Pickup only**, o **Both**.',
        'Kung may pickup ka, i-set ang **Pickup spot** mo (bayan, barangay, at kalye o landmark) at ang optional na pickup instructions.',
        'Ang pickup na order ay **Ready for Pickup** › **Mark Picked Up** (kasama ang proof na litrato) › **Mark Completed**. Libre ang pickup para sa mga buyer.',
      ].join('\n'),
    },
  },
  {
    id: 'payments',
    title: 'How buyers pay: cash, GCash and QR Ph',
    keywords: ['payment', 'payments', 'pay', 'paid', 'gcash', 'qr', 'qr ph', 'qrph', 'maya', 'bank', 'cash', 'cod', 'cash on delivery', 'cash on pickup', 'account name', 'account number', 'payment options', 'bayad', 'magbayad', 'how buyers pay', 'qr code', 'pagbabayad', 'babayaran', 'paraan ng pagbabayad'],
    related: ['new-order', 'delivery', 'start-selling'],
    links: [{ label: 'Payment options', to: '/seller/fulfillment/payment' }],
    answer: {
      en: [
        'Set it in **Me › Delivery & payment › Payment options** (computers: **My Shop › Fulfillment & Payment**):',
        '- **Cash on delivery** (or cash on pickup): buyers pay when they get the order.',
        '- **QR payment**: pick **GCash** or **QR Ph**, enter the account name and number (a GCash number like 0917 123 4567), and upload your QR.',
        'Keep at least one on. With QR payment, buyers scan your QR or send to your number, then enter the reference and upload proof; you check it and tap **Payment received**. Emoorm never holds the money.',
      ].join('\n'),
      tl: [
        'I-set ito sa **Me › Delivery & payment › Payment options** (sa computer: **My Shop › Fulfillment & Payment**):',
        '- **Cash on delivery** (o cash on pickup): magbabayad ang buyer pagkatanggap ng order.',
        '- **QR payment**: piliin ang **GCash** o **QR Ph**, ilagay ang account name at number (GCash number gaya ng 0917 123 4567), at i-upload ang QR mo.',
        'Dapat may kahit isang naka-on. Sa QR payment, ini-scan ng buyer ang QR mo o nagpapadala sa number mo, tapos naglalagay ng reference at nag-a-upload ng proof; titingnan mo ito at ita-tap ang **Payment received**. Hindi humahawak ng pera ang Emoorm.',
      ].join('\n'),
    },
  },
  {
    id: 'not-showing',
    title: 'Why buyers cannot see products',
    keywords: ['not showing', 'cant see', 'can t see', 'cannot see', 'see my products', 'buyers see', 'not visible', 'invisible', 'not live', 'not live yet', 'buyers cant find', 'no one sees', 'nobody sees', 'not appearing', 'hidden', 'di makita', 'hindi makita', 'hindi lumalabas', 'where is my product', 'private', 'nakatago', 'hindi nakikita'],
    related: ['start-selling', 'add-product', 'more-sales'],
    answer: notShowing,
    links: notShowingLinks,
    facts: 'Buyers see a product only when the shop is approved, active (not Inactive) and not suspended, and the product itself is live (not hidden, pending approval, suspended or archived). Signed-in or not makes no difference. A shop that is not ready to sell still shows its products, but buyers cannot order them yet. A new shop is private until the municipal admin approves it.',
  },
  {
    id: 'returns',
    title: 'Returns and refunds',
    keywords: ['return', 'returns', 'refund', 'refunds', 'return request', 'damaged', 'wrong item', 'not as described', 'missing item', 'record refund', 'approve return', 'reject return', 'ibalik', 'sira', 'money back', 'isauli', 'ibinalik', 'maling item'],
    related: ['new-order', 'today', 'more-sales'],
    links: [{ label: 'Returns & refunds', to: '/seller/returns' }],
    answer: {
      en: [
        'Buyers can ask for a return within **7 days** of getting an order (damaged, wrong item, not as described, missing, or other). In **Returns & refunds**:',
        '1. **Approve** (set the approved amount) or **Reject** with a reason.',
        '2. If you need the item back, keep **Requires physical return** on, and tap **Mark items received** when it arrives.',
        '3. **Record refund**: the method (GCash, Bank transfer, Cash or Manual), the amount and a reference.',
        "The refund lowers your earnings. Stock isn't added back by itself, so add it back in My products if the item can be sold again.",
      ].join('\n'),
      tl: [
        'Puwedeng humiling ng return ang buyer sa loob ng **7 araw** mula nang matanggap ang order (sira, maling item, hindi tugma sa description, kulang, o iba pa). Sa **Returns & refunds**:',
        '1. **Approve** (ilagay ang approved amount) o **Reject** kasama ang dahilan.',
        '2. Kung kailangan mong maibalik ang item, iwanang naka-on ang **Requires physical return**, at i-tap ang **Mark items received** kapag dumating na ito.',
        '3. **Record refund**: ang paraan (GCash, Bank transfer, Cash o Manual), ang halaga at isang reference.',
        'Binabawasan ng refund ang kita mo. Hindi kusang naibabalik ang stock, kaya idagdag ito ulit sa My products kung maibebenta pa ang item.',
      ].join('\n'),
    },
  },
  {
    id: 'reviews',
    title: 'Reviews and replies',
    keywords: ['review', 'reviews', 'rating', 'ratings', 'star', 'stars', 'reply to review', 'bad review', 'negative review', 'delete review', 'report review', 'feedback from buyers', 'sagutin ang review', 'pangit na review'],
    related: ['more-sales', 'today', 'returns'],
    links: [{ label: 'Reviews', to: '/seller/reviews' }],
    answer: {
      en: [
        'Open **Reviews** (phones: Home › Reviews). Filter by **Needs reply**, tap **Reply**, write your answer (up to 1000 characters) and tap **Post Reply**; you can change it later with **Edit reply**. Replies are public.',
        "You can't delete or report a review. If one breaks the rules, message the admin. An average under 3★ (from at least 3 reviews) puts your shop health at **Needs attention**.",
      ].join('\n'),
      tl: [
        'Buksan ang **Reviews** (phone: Home › Reviews). I-filter sa **Needs reply**, i-tap ang **Reply**, isulat ang sagot mo (hanggang 1000 characters) at i-tap ang **Post Reply**; puwede mo itong baguhin mamaya gamit ang **Edit reply**. Public ang mga reply.',
        'Hindi mo puwedeng burahin o i-report ang review. Kung lumalabag ito sa rules, mag-message sa admin. Kapag mas mababa sa 3★ ang average (mula sa hindi bababa sa 3 review), magiging **Needs attention** ang shop health mo.',
      ].join('\n'),
    },
  },
  {
    id: 'more-sales',
    title: 'Getting more buyers',
    keywords: ['more buyers', 'more sales', 'more customers', 'customers', 'promote', 'promotion', 'marketing', 'announce', 'announcement', 'followers', 'follower', 'share shop', 'advertise', 'ads', 'boost', 'grow', 'dagdag benta', 'sales tips', 'tips', 'suki', 'dumami', 'mas maraming buyer', 'lumakas ang benta', 'makakuha ng buyer'],
    related: ['add-product', 'not-showing', 'today'],
    links: [
      { label: 'Marketing', to: '/seller/marketing' },
      { label: 'Decorate my shop', to: '/seller/decorate' },
    ],
    answer: {
      en: [
        'Ways to bring in buyers:',
        '- **Marketing › Announce**: message your followers (5–280 characters, up to 2 a day).',
        '- **Promote a product**: send one of your live products to your followers.',
        '- **Share shop**: share your shop link anywhere.',
        '- **Decorate**: pick a template for your shop colours, and add a logo and banner.',
        '- Use clear photos and honest descriptions, keep delivery fees fair, confirm orders quickly and reply to chats and reviews.',
        'Announcements work once your shop is public and ready to sell.',
      ].join('\n'),
      tl: [
        'Mga paraan para dumami ang buyer mo:',
        '- **Marketing › Announce**: mag-message sa followers mo (5–280 characters, hanggang 2 bawat araw).',
        '- **Promote a product**: ipadala sa followers ang isa sa mga live na produkto mo.',
        '- **Share shop**: i-share ang link ng shop mo kahit saan.',
        '- **Decorate**: pumili ng template para sa kulay ng shop, at maglagay ng logo at banner.',
        '- Gumamit ng malinaw na litrato at tapat na description, gawing patas ang delivery fee, i-confirm agad ang mga order at sumagot sa chats at reviews.',
        'Gumagana ang announcements kapag public at ready to sell na ang shop mo.',
      ].join('\n'),
    },
  },
  {
    id: 'vouchers',
    title: 'Vouchers and discounts',
    keywords: ['voucher', 'vouchers', 'discount', 'discounts', 'promo code', 'coupon', 'sale price', 'markdown', 'diskwento', 'bawas presyo'],
    related: ['more-sales', 'edit-product', 'add-product'],
    links: [{ label: 'My products', to: '/seller/products' }],
    answer: {
      en: "Sellers can't create vouchers or discount codes: Emoorm's admins run vouchers. To offer a lower price, edit the product's price in **My products**, then tell your followers with **Marketing › Announce**.",
      tl: 'Hindi puwedeng gumawa ng voucher o discount code ang mga seller: ang mga admin ng Emoorm ang humahawak ng vouchers. Para magbigay ng mas mababang presyo, i-edit ang presyo ng produkto sa **My products**, tapos ibalita sa followers mo gamit ang **Marketing › Announce**.',
    },
  },
  {
    id: 'earnings',
    title: 'Earnings, analytics and fees',
    keywords: ['earnings', 'earning', 'revenue', 'income', 'sales report', 'finance', 'money', 'payout', 'withdraw', 'wallet', 'commission', 'charge', 'charges', 'how much do you charge', 'free to sell', 'cost to sell', 'monthly fee', 'subscription', 'how much did i earn', 'analytics', 'performance', 'best selling', 'kinita', 'kita ko', 'export', 'magkano ang kita', 'bayad sa emoorm', 'libre ba'],
    related: ['today', 'more-sales', 'new-order'],
    links: [
      { label: 'Finance', to: '/seller/finance' },
      { label: 'Analytics', to: '/seller/analytics' },
    ],
    answer: {
      en: [
        '**Finance** (phones: Me › My earnings) shows Earned this period, Lifetime earnings, Orders in progress and Average order value, with your completed orders (you can export them).',
        'Only **completed** orders count as earnings, and refunds are taken off. **Analytics** (phones: Home › Performance) shows daily sales, best-selling products, sales by category and more.',
        'Emoorm is free to sell on and takes no commission. There is no wallet or payout: buyers pay you directly.',
      ].join('\n'),
      tl: [
        'Ipinapakita ng **Finance** (phone: Me › My earnings) ang Earned this period, Lifetime earnings, Orders in progress at Average order value, kasama ang mga completed order mo (puwede mo itong i-export).',
        'Ang mga **completed** na order lang ang binibilang na kita, at ibinabawas ang mga refund. Ang **Analytics** (phone: Home › Performance) ay nagpapakita ng daily sales, best-selling products, sales by category at iba pa.',
        'Libre ang magbenta sa Emoorm at walang commission. Walang wallet o payout: direkta kang binabayaran ng mga buyer.',
      ].join('\n'),
    },
  },
  {
    id: 'chat',
    title: 'Chatting with buyers',
    keywords: ['chat', 'message', 'messages', 'inbox', 'reply buyer', 'buyer message', 'customer message', 'contact buyer', 'mensahe', 'usap', 'quick reply', 'kausapin', 'sumagot sa buyer'],
    related: ['new-order', 'today', 'more-sales'],
    links: [{ label: 'Chat', to: '/seller/messages' }],
    answer: {
      en: [
        'Buyer chats are in the **Chat** tab (computers: **Messages**). Send text (up to 2000 characters) and photos, and attach an order or a product.',
        'You can start a chat only with buyers who have ordered from you. Quick replies win more orders.',
        'To talk to Emoorm instead, switch the Chat header from **Buyers** to **Municipal admin**.',
      ].join('\n'),
      tl: [
        'Nasa **Chat** tab ang mga chat ng buyer (sa computer: **Messages**). Puwede kang magpadala ng text (hanggang 2000 characters) at litrato, at mag-attach ng order o produkto.',
        'Makakapagsimula ka lang ng chat sa mga buyer na naka-order na sa iyo. Mas maraming order ang nakukuha sa mabilis na pagsagot.',
        'Para kausapin ang Emoorm, palitan ang **Buyers** sa Chat header ng **Municipal admin**.',
      ].join('\n'),
    },
  },
  {
    id: 'admin-help',
    title: 'Getting help from Emoorm',
    keywords: ['admin', 'support', 'contact emoorm', 'report a problem', 'problem', 'complaint', 'customer service', 'municipal admin', 'case', 'ticket', 'tulong', 'help center', 'send feedback', 'report buyer', 'bogus buyer', 'reklamo', 'problema'],
    related: ['today', 'not-showing', 'new-order'],
    links: ADMIN_LINKS,
    answer: {
      en: [
        'To reach Emoorm, open **Me › Message the admin** (computers: **Admin** in the sidebar) and start a **New support case**: choose what it is about, add a subject and the details. Replies come there, and you can rate the case once it is resolved.',
        'You can report a buyer from their order (for example "Did not pay for the order"), and send ideas with **Me › Send feedback**.',
      ].join('\n'),
      tl: [
        'Para makausap ang Emoorm, buksan ang **Me › Message the admin** (sa computer: **Admin** sa sidebar) at magsimula ng **New support case**: piliin kung tungkol saan ito, maglagay ng subject at mga detalye. Doon darating ang mga sagot, at puwede mong i-rate ang case kapag naresolba na.',
        'Puwede mong i-report ang buyer mula sa order niya (halimbawa "Did not pay for the order"), at magpadala ng suhestiyon gamit ang **Me › Send feedback**.',
      ].join('\n'),
    },
  },
  {
    id: 'approval',
    title: 'Seller application and approval',
    keywords: ['approval', 'approve', 'approved', 'application', 'apply', 'applied', 'private', 'under review', 'when approved', 'rejected', 'not approved', 'reapply', 'sell on emoorm', 'naaprubahan', 'aprubahan', 'maaprubahan'],
    related: ['start-selling', 'not-showing', 'add-product'],
    links: [{ label: 'Complete your shop', to: '/seller' }],
    answer: {
      en: [
        'After you apply, your shop is **private** until your municipal admin approves it (usually 1–2 business days). Meanwhile you can set it up and add products.',
        'Once approved you\'ll get **Seller Application Approved** and your shop goes public. If it isn\'t approved you\'ll see the reason, and you can apply again.',
        'Verifying your ID is not needed to sell, but admins approve verified shops faster.',
      ].join('\n'),
      tl: [
        'Pagkatapos mag-apply, **private** ang shop mo hangga\'t hindi pa ito naaaprubahan ng municipal admin (karaniwang 1–2 business days). Habang naghihintay, puwede mo itong i-set up at magdagdag ng produkto.',
        'Kapag naaprubahan, makakatanggap ka ng **Seller Application Approved** at magiging public ang shop mo. Kung hindi naaprubahan, makikita mo ang dahilan, at puwede kang mag-apply ulit.',
        'Hindi kailangan ang pag-verify ng ID para makapagbenta, pero mas mabilis inaaprubahan ng mga admin ang verified na shop.',
      ].join('\n'),
    },
  },
  {
    id: 'verify-id',
    title: 'Verifying identity',
    keywords: ['verify', 'verify identity', 'verification', 'identity', 'id', 'valid id', 'government id', 'kyc', 'verified', 'beripika', 'beripikahin'],
    related: ['approval', 'start-selling', 'today'],
    links: [{ label: 'Verify identity', to: '/seller/verification' }],
    answer: {
      en: [
        '**Verify identity** (Me › Settings › Verify identity) reads a Philippine government ID: take a photo of the front (the back is optional). The name on it must match your account name; the address is not checked.',
        "It isn't required to sell, but admins approve verified shops faster. You can try 5 times a day, and one ID can verify only one account. Changing your profile name means verifying again.",
      ].join('\n'),
      tl: [
        'Binabasa ng **Verify identity** (Me › Settings › Verify identity) ang Philippine government ID: kunan ng litrato ang harap (optional ang likod). Dapat tugma ang pangalan dito sa pangalan ng account mo; hindi tinitingnan ang address.',
        'Hindi ito kailangan para makapagbenta, pero mas mabilis inaaprubahan ng mga admin ang verified na shop. May 5 subok ka bawat araw, at isang account lang ang puwedeng i-verify ng isang ID. Kapag pinalitan mo ang pangalan sa profile, kailangan mong mag-verify ulit.',
      ].join('\n'),
    },
  },
  {
    id: 'shop-profile',
    title: 'Shop profile and decorating',
    keywords: ['shop profile', 'shop name', 'rename', 'change name', 'description', 'logo', 'banner', 'cover', 'location', 'map', 'pin', 'colors', 'colours', 'color', 'theme', 'decorate', 'template', 'shop link', 'store link', 'design', 'storefront', 'pangalan ng shop', 'palitan ang pangalan', 'kulay'],
    related: ['more-sales', 'start-selling', 'not-showing'],
    links: [
      { label: 'Shop profile', to: '/seller/store' },
      { label: 'Decorate my shop', to: '/seller/decorate' },
    ],
    answer: {
      en: [
        'Edit your shop in **Me › Settings › Shop profile** (computers: **My Shop › Shop Profile**): name and description, logo and banner, location (a pin on the map), and shop colours.',
        '**Decorate my shop** has ready templates (Fresh Market, Island Blue, Sunset Crafts, Charcoal, Blossom Pink, Coffee & Cacao) that set your colours.',
        'Changing your shop name also changes your shop link.',
      ].join('\n'),
      tl: [
        'I-edit ang shop mo sa **Me › Settings › Shop profile** (sa computer: **My Shop › Shop Profile**): pangalan at description, logo at banner, location (pin sa mapa), at kulay ng shop.',
        'May mga handang template ang **Decorate my shop** (Fresh Market, Island Blue, Sunset Crafts, Charcoal, Blossom Pink, Coffee & Cacao) na nagse-set ng mga kulay mo.',
        'Kapag pinalitan mo ang pangalan ng shop, magbabago rin ang link ng shop mo.',
      ].join('\n'),
    },
  },
  {
    id: 'close-shop',
    title: 'Pausing or deleting the shop',
    keywords: ['close shop', 'close my shop', 'pause', 'vacation', 'holiday', 'deactivate', 'inactive', 'turn off', 'delete shop', 'remove shop', 'stop selling', 'isara', 'deletion', 'cancel deletion', 'bakasyon', 'pansamantala', 'ihinto'],
    related: ['shop-profile', 'today', 'admin-help'],
    links: [
      { label: 'Name & description', to: '/seller/store/about' },
      { label: 'Shop settings', to: '/seller/settings' },
    ],
    answer: {
      en: [
        '- To pause selling, turn your shop **Inactive** in Me › Shop profile › Name & description (computers: the **Store is Active** switch in Shop Profile). It hides your shop and products until you turn it back on.',
        '- **Delete Shop** (Me › Settings › Shop settings) hides your shop at once and deletes it for good after 15 days, unless you tap **Cancel Deletion** before then.',
      ].join('\n'),
      tl: [
        '- Para pansamantalang huminto sa pagbebenta, gawing **Inactive** ang shop mo sa Me › Shop profile › Name & description (sa computer: ang **Store is Active** switch sa Shop Profile). Itatago nito ang shop at mga produkto mo hangga\'t hindi mo ito ino-on ulit.',
        '- Ang **Delete Shop** (Me › Settings › Shop settings) ay agad na nagtatago ng shop mo at tuluyan itong binubura pagkalipas ng 15 araw, maliban kung i-tap mo ang **Cancel Deletion** bago iyon.',
      ].join('\n'),
    },
  },
  {
    id: 'suspended',
    title: 'Suspended shop',
    keywords: ['suspended', 'suspension', 'banned', 'blocked', 'disabled', 'shop suspended', 'store suspended', 'na suspend'],
    related: ['admin-help', 'not-showing', 'today'],
    links: ADMIN_LINKS,
    answer: {
      en: "If an admin suspends your shop you'll see **Your store has been suspended**, with the reason. Your shop is hidden, buyers can't order, and you can't add or edit products. Message the admin to sort it out; you'll get **Your store is active again** once it's lifted.",
      tl: 'Kapag sinuspend ng admin ang shop mo, makikita mo ang **Your store has been suspended**, kasama ang dahilan. Nakatago ang shop mo, hindi makakaorder ang mga buyer, at hindi ka makakapagdagdag o makakapag-edit ng produkto. Mag-message sa admin para maayos ito; makakatanggap ka ng **Your store is active again** kapag inalis na ito.',
    },
  },
  {
    id: 'shop-health',
    title: 'Shop health',
    keywords: ['shop health', 'health', 'needs attention', 'excellent', 'good health', 'shop score', 'cancel rate'],
    related: ['today', 'reviews', 'cancel-order'],
    links: [{ label: 'Me', to: '/seller/menu' }],
    answer: {
      en: [
        'Shop health (on the Me tab) is:',
        '- **Excellent**: no issues.',
        '- **Good**: only small ones (no live products, or no orders in 30 days).',
        "- **Needs attention**: your shop isn't ready to sell, 30% or more of your orders were cancelled in 30 days (at least 3 orders), or your reviews average under 3★ (at least 3 reviews).",
      ].join('\n'),
      tl: [
        'Ang shop health (nasa Me tab) ay:',
        '- **Excellent**: walang problema.',
        '- **Good**: maliliit na bagay lang (walang live na produkto, o walang order sa loob ng 30 araw).',
        '- **Needs attention**: hindi pa ready to sell ang shop mo, 30% o higit pa ng mga order mo ang nakansela sa loob ng 30 araw (hindi bababa sa 3 order), o mas mababa sa 3★ ang average ng reviews mo (hindi bababa sa 3 review).',
      ].join('\n'),
    },
  },
  {
    id: 'account',
    title: 'Seller login and switching accounts',
    keywords: ['login', 'log in', 'sign in', 'password', 'seller login', 'switch account', 'buyer account', 'switch to buyer', 'logout', 'log out', 'google', 'forgot password', 'two step', 'mfa', 'mag login', 'nakalimutan ang password'],
    related: ['today', 'admin-help', 'start-selling'],
    links: [{ label: 'Me', to: '/seller/menu' }],
    answer: {
      en: 'Use **Seller Login** (top right of the login page) to open the Seller Center; the normal login opens your buyer side. Switch sides with **Me › Switch to my buyer account**. Forgot your password? Tap **Forgot?** on the login page.',
      tl: 'Gamitin ang **Seller Login** (kanang itaas ng login page) para buksan ang Seller Center; ang normal na login ay nagbubukas ng buyer side mo. Lumipat ng side gamit ang **Me › Switch to my buyer account**. Nakalimutan ang password? I-tap ang **Forgot?** sa login page.',
    },
  },
];

/* ── The suggested questions ───────────────────────────────────────── */

const PRESETS = [
  { id: 'start-selling', topic: 'start-selling', question: { en: 'What do I still need to start selling?', tl: 'Ano pa ang kulang para makapagbenta ako?' } },
  { id: 'today', topic: 'today', question: { en: 'What needs my attention today?', tl: 'Ano ang dapat kong asikasuhin ngayon?' } },
  { id: 'add-product', topic: 'add-product', question: { en: 'How do I add a product?', tl: 'Paano magdagdag ng produkto?' } },
  { id: 'available-today', topic: 'available-today', question: { en: 'How do I sell food for today only?', tl: 'Paano magbenta ng pagkain para ngayong araw lang?' } },
  { id: 'new-order', topic: 'new-order', question: { en: 'What do I do with a new order?', tl: 'Ano ang gagawin ko sa bagong order?' } },
  { id: 'delivery', topic: 'delivery', question: { en: 'How do I set delivery areas and fees?', tl: 'Paano i-set ang delivery areas at fees?' } },
  { id: 'payments', topic: 'payments', question: { en: 'How do buyers pay me?', tl: 'Paano ako babayaran ng mga buyer?' } },
  { id: 'not-showing', topic: 'not-showing', question: { en: "Why can't buyers see my products?", tl: 'Bakit hindi makita ng mga buyer ang mga produkto ko?' } },
  { id: 'returns', topic: 'returns', question: { en: 'How do returns and refunds work?', tl: 'Paano gumagana ang returns at refunds?' } },
  { id: 'more-sales', topic: 'more-sales', question: { en: 'How can I get more buyers?', tl: 'Paano ako makakakuha ng mas maraming buyer?' } },
];

/* ── Telling seller questions from everything else ─────────────────── */

/** Words that make a question about selling on Emoorm (normalized). */
const DOMAIN_WORDS = [
  'emoorm', 'moormy', 'shop', 'store', 'seller', 'sell', 'selling', 'sold', 'sale', 'sales', 'buyer', 'customer',
  'product', 'item', 'listing', 'order', 'delivery', 'deliver', 'delivered', 'pickup', 'pick up', 'fee', 'shipping',
  'ship', 'barangay', 'payment', 'pay', 'paid', 'gcash', 'qr', 'qr ph', 'qrph', 'cod', 'cash on delivery', 'refund',
  'return', 'cancel', 'cancelled', 'review', 'rating', 'follower', 'announcement', 'announce', 'promote', 'marketing',
  'voucher', 'discount', 'promo', 'coupon', 'commission', 'earning', 'earnings', 'revenue', 'income', 'finance', 'analytics', 'chat', 'inbox',
  'notification', 'verification', 'verify', 'identity', 'approval', 'approved', 'application', 'logo', 'banner',
  'decorate', 'template', 'stock', 'inventory', 'price', 'photo', 'category', 'variation', 'proof', 'reference',
  'receipt', 'seller center', 'dashboard', 'setup', 'checklist', 'suspended', 'admin', 'courier', 'rider',
  'business', 'negosyo', 'tindahan', 'paninda', 'produkto', 'benta', 'magbenta', 'nagbebenta', 'mamimili',
  'presyo', 'bayad', 'magbayad', 'padala', 'singil', 'kustomer', 'suki', 'kinita', 'resibo',
  'makapagbenta', 'pagbebenta', 'pagbabayad', 'nagbayad', 'kita ko', 'mamili', 'bumili',
];

/** Common Tagalog words: two or more in a question (one when it is short) mean Tagalog. */
const TAGALOG_WORDS = new Set([
  'ang', 'ng', 'mga', 'sa', 'ko', 'mo', 'ba', 'po', 'na', 'ako', 'ikaw', 'siya', 'kami', 'tayo', 'sila', 'niya', 'natin',
  'paano', 'ano', 'bakit', 'saan', 'kailan', 'magkano', 'ilan', 'sino', 'nasaan', 'hindi', 'wala', 'meron', 'mayroon',
  'gusto', 'pwede', 'puwede', 'kasi', 'lang', 'naman', 'yung', 'iyong', 'ito', 'iyan', 'dito', 'diyan', 'kung', 'para',
  'pag', 'kapag', 'din', 'rin', 'pa', 'nga', 'oo', 'opo', 'salamat', 'kumusta', 'musta', 'paki', 'nang',
  'kailangan', 'dapat', 'aking', 'iyo', 'inyo', 'namin', 'akin', 'lahat', 'bawat', 'ngayon', 'bago', 'tapos',
  // As people text them.
  'pano', 'panu', 'bat', 'anu', 'pede', 'pde', 'pwd', 'mag', 'nag', 'ung', 'yun', 'di', 'hnd', 'wla', 'sya', 'nyo',
]);

/** A message that only greets, thanks or asks for help. */
const GREETING = /^(hi|hello|hey|hoy|yo|good (morning|afternoon|evening|day)|magandang (umaga|hapon|gabi|araw)|kumusta|musta|thanks|thank you|salamat|ty|ok|okay|sige|help|help me|can you help( me)?|pwede (mo )?(ba )?(akong )?tulungan|tulungan mo (ako)?)( po)?[\s!.?]*$/i;

/** Asking who Ate Moormy is. */
const ABOUT_QUESTION = /^(who are you|what are you|what can you do|what do you do|sino ka|ano ka|anong kaya mo|ano ang kaya mo)( po)?[\s!.?]*$/i;

/** Questions that are plainly about something else. */
const OFF_TOPIC_PATTERNS = [
  /\bcapital of\b/i,
  /\b(president|senator|mayor|election|politic)/i,
  /\b(weather|forecast|typhoon signal)\b/i,
  /\b(recipe|how to cook|how do i cook)\b/i,
  /\b(joke|poem|song|lyrics|story|riddle)\b/i,
  /\b(homework|assignment|essay|thesis)\b/i,
  /\b(python|javascript|java|html|css|sql|programming|coding)\b/i,
  /\b(bitcoin|crypto|forex|stock market|lotto|lottery|horoscope|zodiac)\b/i,
  /\b(movie|netflix|anime|celebrity|basketball|nba|football|game score)\b/i,
  /\btranslate\b/i,
  /^\s*[\d\s.+\-*/x×÷()^=?]+$/i,
  /\b\d+(\.\d+)?\s*[+\-*/×÷^]\s*\d+/,
  /\b(what is|who is|who was|when was|when is) (the )?(meaning of life|love|god)\b/i,
  /\b(kanta|tula|biro|lutuin|paano magluto)\b/i,
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
