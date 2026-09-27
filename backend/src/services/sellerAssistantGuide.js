/**
 * Ate Moormy's seller guide: what the Seller Center does, in the words the
 * app shows. Each topic answers on its own (the suggested questions, and
 * typed questions when no model is set up) and is what the model answers
 * from. Every fact here comes from the app itself; keep it in step when a
 * screen or rule changes.
 *
 * Places: phones have the tabs Home, Chat, Marketing and Me; computers have
 * the sidebar. Answers name the phone place first.
 */

const NAME = 'Ate Moormy';

const greeting = (name) => `Hi${name ? ` ${name}` : ''}! I'm **Ate Moormy**, your Emoorm seller assistant. Ask me about selling on Emoorm: your shop, products, orders, delivery, payments, returns and more. You can also tap a question below.`;

const hello = (name) => `Hello${name ? ` ${name}` : ''}! What would you like to know about selling on Emoorm?`;

const ABOUT_ME = "I'm **Ate Moormy**, Emoorm's AI assistant for sellers. I can explain how the Seller Center works (products, orders, delivery, payments, returns, marketing and your earnings) and tell you what your shop still needs or what is waiting for you. I only answer questions about selling on Emoorm.";

const OFF_TOPIC_REPLY = 'Pasensya na, I can only help with selling on Emoorm: your shop, products, orders, delivery and pickup, payments, returns, marketing and the Seller Center. Try one of these:';

const NOT_SURE_REPLY = "I'm not sure about that one. Your municipal admin can help: on phones open **Me › Message the admin**; on computers open **Admin** in the sidebar.";

const ADMIN_LINKS = [{ label: 'Message the admin', to: '/seller/support' }];

/** A map of the Seller Center, always given to the model. */
const OVERVIEW = [
  'Emoorm is free to sell on, takes no commission and never holds money: buyers pay the seller directly (cash, or the seller\'s GCash / QR Ph code).',
  'Phones: the Seller Center has tabs Home (tools: My products, My orders, Performance, Finance, Reviews, Returns, Decorate, Add product), Chat, Marketing and Me (Finance: My earnings; Delivery & payment: Delivery & pickup, Pickup spot, Delivery areas & fees, Payment options; Contact & help: Message the admin, Help center, Send feedback; Settings: Shop profile, Shop setup, Verify identity, Notifications, Language, Shop settings, Switch to my buyer account).',
  'Computers: the sidebar has Shop setup, Dashboard, My Orders, Returns & refunds, Messages, Admin, Products (All Products, Add New), Notifications, Reviews, Analytics, Finance, and My Shop (Shop Profile, Fulfillment & Payment, Settings, View Storefront).',
].join('\n');

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* ── Answers that read the seller's own shop ───────────────────────── */

const MISSING = {
  'delivery-areas': {
    text: '**Choose where you deliver**: Me › Delivery & payment › Delivery areas & fees.',
    link: { label: 'Delivery areas & fees', to: '/seller/fulfillment/delivery' },
  },
  'delivery-fee': {
    text: '**Set your delivery fee**: on the same page, answer *How much is delivery?*',
    link: { label: 'Delivery areas & fees', to: '/seller/fulfillment/delivery' },
  },
  pickup: {
    text: '**Set your pickup spot**: Me › Delivery & payment › Pickup spot.',
    link: { label: 'Pickup spot', to: '/seller/fulfillment/pickup' },
  },
  payment: {
    text: '**Add a way to pay**: turn on cash, or add your GCash or QR Ph code in Me › Delivery & payment › Payment options.',
    link: { label: 'Payment options', to: '/seller/fulfillment/payment' },
  },
};

const NO_SHOP = "You don't have a shop yet. Tap **Apply to sell** on the Sell on Emoorm page to open one; your shop stays private until your municipal admin approves it.";

const uniqueLinks = (links) => links.filter((l, i) => links.findIndex((x) => x.to === l.to) === i);

const startSelling = (snap) => {
  if (!snap.store) return NO_SHOP;
  const s = snap.store;
  const lines = [];
  if (s.suspended) lines.push('Your shop is **suspended** by an admin, so buyers can\'t order. Message the admin to find out why.');
  if (snap.readyToSell) {
    lines.push('Your shop is **ready to sell**: delivery or pickup, and a way to pay, are all set.');
    if (!snap.liveProducts) lines.push('Next, **add your first product** so buyers have something to order (Home › Add product).');
    else lines.push(`Buyers can order your ${plural(snap.liveProducts, 'live product')}. To reach more of them, try **Marketing › Announce** or **Promote a product**.`);
  } else {
    lines.push("Buyers can't order from your shop yet. Still needed:");
    snap.missing.forEach((key, i) => lines.push(`${i + 1}. ${MISSING[key]?.text || key}`));
    lines.push('Your products go live by themselves once these are done.');
  }
  if (!s.approved) lines.push('Your shop is also **private** until your municipal admin approves it (usually 1–2 business days). You can keep setting it up meanwhile.');
  if (!s.open) lines.push('Your shop is turned **Inactive**. Turn it on in Me › Shop profile › Name & description.');
  return lines.join('\n');
};

const startSellingLinks = (snap) => {
  if (!snap.store) return [{ label: 'Apply to sell', to: '/seller/apply' }];
  const links = snap.readyToSell
    ? (snap.liveProducts ? [] : [{ label: 'Add product', to: '/seller/products/new' }])
    : snap.missing.map((key) => MISSING[key]?.link).filter(Boolean);
  return uniqueLinks([...links, { label: 'Shop setup', to: '/seller/setup' }]).slice(0, 3);
};

const WAITING = [
  ['pendingOrders', 'new order', 'to confirm', { label: 'My orders', to: '/seller/orders' }],
  ['openReturns', 'return request', 'to review', { label: 'Returns & refunds', to: '/seller/returns' }],
  ['unreadMessages', 'unread buyer chat', '', { label: 'Chat', to: '/seller/messages' }],
  ['adminMessages', 'unread message', 'from the admin', { label: 'Admin messages', to: '/seller/support' }],
  ['lowStock', 'product', 'low on stock', { label: 'My products', to: '/seller/products' }],
];

const today = (snap) => {
  if (!snap.store) return NO_SHOP;
  const items = WAITING
    .filter(([key]) => snap.waiting[key] > 0)
    .map(([key, word, rest]) => `**${plural(snap.waiting[key], word)}**${rest ? ` ${rest}` : ''}`);
  if (snap.readyToSell === false) items.unshift("**Finish your shop setup**: buyers can't order yet");
  if (!items.length) {
    return 'Nothing is waiting on you right now. A good time to add products, reply to reviews, or send your followers an announcement from **Marketing**.';
  }
  return [
    "Here's what's waiting for you:",
    ...items.map((item) => `- ${item}`),
    'Confirm new orders within 48 hours: orders left unconfirmed are cancelled automatically.',
  ].join('\n');
};

const todayLinks = (snap) => {
  if (!snap.store) return [];
  const links = WAITING.filter(([key]) => snap.waiting[key] > 0).map(([, , , link]) => link);
  if (snap.readyToSell === false) links.unshift({ label: 'Shop setup', to: '/seller/setup' });
  return links.slice(0, 3);
};

const notShowing = (snap) => {
  if (!snap.store) return NO_SHOP;
  const s = snap.store;
  if (s.suspended) return 'Your shop is **suspended** by an admin, so it is hidden from buyers. Message the admin to find out why; you\'ll get "Your store is active again" when it\'s lifted.';
  if (!s.approved) return 'Your shop is **private** until your municipal admin approves it (usually 1–2 business days), so buyers can\'t see it yet. You can keep adding products meanwhile; they show once you\'re approved and ready to sell.';
  if (!s.open) return 'Your shop is turned **Inactive**, which hides it and its products. Turn it on in Me › Shop profile › Name & description (computers: the **Store is Active** switch in Shop Profile).';
  if (snap.readyToSell === false) {
    return [
      "Buyers can't see your products because your shop isn't ready to sell yet. Still needed:",
      ...snap.missing.map((key, i) => `${i + 1}. ${MISSING[key]?.text || key}`),
      'Your products go live by themselves once these are done.',
    ].join('\n');
  }
  if (!snap.products) return "You haven't added any products yet. Tap **Home › Add product** (computers: **Products › Add New**); new products go live right away.";
  if (snap.liveProducts < snap.products) {
    return `${snap.liveProducts} of your ${plural(snap.products, 'product')} ${snap.liveProducts === 1 ? 'is' : 'are'} live. The others may be **hidden** (tap Show), **suspended** by an admin, or **archived**. Check the tabs in **My products**.`;
  }
  return `Your shop and all ${plural(snap.products, 'product')} are live. Buyers find them through search, categories and your shop page. Clear photos, good names and fair delivery fees help them stand out.`;
};

const notShowingLinks = (snap) => {
  if (!snap.store) return [{ label: 'Apply to sell', to: '/seller/apply' }];
  if (snap.store.suspended) return ADMIN_LINKS;
  if (!snap.store.open) return [{ label: 'Name & description', to: '/seller/store/about' }];
  if (snap.readyToSell === false) return uniqueLinks([...snap.missing.map((k) => MISSING[k]?.link).filter(Boolean), { label: 'Shop setup', to: '/seller/setup' }]).slice(0, 3);
  if (!snap.products) return [{ label: 'Add product', to: '/seller/products/new' }];
  return [{ label: 'My products', to: '/seller/products' }];
};

/* ── The topics ────────────────────────────────────────────────────── */

const TOPICS = [
  {
    id: 'start-selling',
    title: 'What a shop needs before buyers can order',
    keywords: ['start selling', 'ready to sell', 'get started', 'start', 'begin', 'setup', 'set up', 'checklist', 'go live', 'live', 'open my shop', 'first time', 'magsimula', 'simulan', 'umpisa', 'ready'],
    related: ['delivery', 'payments', 'add-product'],
    answer: startSelling,
    links: startSellingLinks,
    facts: 'A shop is ready to sell when: if it delivers, it has at least one delivery area and a fee decided for every area; if it offers pickup, it has a pickup spot; and buyers have a way to pay (cash on, or a QR uploaded). Until then its products are hidden from buyers and checkout says "This shop isn\'t taking orders yet." Products go live by themselves once the shop is ready. Shop setup (Me › Settings › Shop setup; computers: Shop setup in the sidebar) lists every step: logo and banner, description and map pin, delivery areas, delivery fees, pickup spot, payment QR (optional while cash is on), first product, verify identity and get approved. Verifying the ID is not needed to sell, but admins approve verified shops faster. A new shop is private until the municipal admin approves it, usually in 1–2 business days.',
  },
  {
    id: 'today',
    title: 'What is waiting on the seller',
    keywords: ['today', 'attention', 'waiting', 'to do', 'todo', 'next', 'what should i do', 'pending', 'gagawin', 'ngayon', 'unread', 'badge'],
    related: ['new-order', 'returns', 'not-showing'],
    answer: today,
    links: todayLinks,
    facts: 'Home (phones) counts orders To confirm and To ship, Returns and Reviews. The sidebar badges count new orders to confirm, return requests to review, unread buyer chats, unread admin messages and products low on stock. New orders must be confirmed within 48 hours or they are cancelled automatically.',
  },
  {
    id: 'add-product',
    title: 'Adding a product',
    keywords: ['add product', 'add a product', 'new product', 'add item', 'list', 'listing', 'post product', 'upload product', 'photos', 'photo', 'picture', 'category', 'description', 'magdagdag', 'produkto', 'mag post', 'choices', 'variation', 'variations', 'size', 'weight'],
    related: ['not-showing', 'more-sales', 'new-order'],
    links: [{ label: 'Add product', to: '/seller/products/new' }],
    answer: [
      'To add a product:',
      '1. On phones tap **Home › Add product** (computers: **Products › Add New**).',
      '2. **Photos**: up to 10 (JPEG, PNG or WebP, up to 5 MB each). The first one is the cover.',
      '3. **About the product**: a name, a category and a description (at least 10 characters).',
      '4. **Choices** (optional): e.g. Size, Weight or Color; one type can have its own price per choice and one its own stock.',
      '5. **Price and stock**, then **Returns** (optional: no returns, 7-day returns, perishable goods, or your own words).',
      '6. Tap **Add product**.',
      'New products go live right away, with no admin review, once your shop is ready to sell. Until then the button says **Save as draft** and the product waits.',
    ].join('\n'),
  },
  {
    id: 'edit-product',
    title: 'Editing, hiding, deleting and restocking products',
    keywords: ['edit product', 'change price', 'update price', 'price', 'edit', 'hide', 'unhide', 'show product', 'delete product', 'remove product', 'stock', 'restock', 'add stock', 'out of stock', 'low stock', 'inventory', 'my products', 'suspended product', 'pending approval', 'archived'],
    related: ['add-product', 'not-showing', 'today'],
    links: [{ label: 'My products', to: '/seller/products' }],
    answer: [
      'In **My products** (phones: Home › My products; computers: Products › All Products):',
      '- **Edit** changes the photos, price, choices or description.',
      '- **Hide** takes a product off your shop without deleting it; **Show** brings it back (once your shop is ready to sell).',
      '- **Add stock**: phones have +5, +10, +20 and +50 buttons; products with stock per choice use **Edit stock**.',
      "- **Delete** removes a product for good; it can't be undone.",
      'A **Low stock** badge shows when stock is 5 or less. Select several products to hide, show or delete them at once. If an admin suspends a product you\'ll see the reason; editing it sends it back for approval.',
    ].join('\n'),
  },
  {
    id: 'new-order',
    title: 'Handling an order, step by step',
    keywords: ['new order', 'order', 'confirm', 'confirm order', 'prepare', 'preparing', 'to ship', 'ship', 'out for delivery', 'delivered', 'mark delivered', 'complete', 'completed', 'order status', 'proof of delivery', 'fulfil', 'fulfill', 'process order', 'bagong order', 'picked up'],
    related: ['payments', 'returns', 'today'],
    links: [{ label: 'My orders', to: '/seller/orders' }],
    answer: [
      'When a new order comes in (**My orders › New**):',
      '1. **Confirm Order** within 48 hours, or it is cancelled automatically.',
      "2. GCash / QR Ph orders: check the payment proof and tap **Payment received** (or **Reject payment**). You can't ship until the payment is verified.",
      '3. Delivery: **Start Preparing** (optional) › **Mark Ready to Ship** › **Out for Delivery** › **Mark Delivered** with a proof-of-delivery photo.',
      '4. Pickup: **Ready for Pickup** › **Mark Picked Up** with a proof photo.',
      '5. **Mark Completed**, or the buyer completes it by confirming they got the order.',
      'Cash on delivery orders are marked paid when they are delivered or picked up.',
    ].join('\n'),
  },
  {
    id: 'verify-payment',
    title: 'Checking GCash / QR Ph payments',
    keywords: ['verify payment', 'verify', 'check payment', 'confirm payment', 'payment from gcash', 'proof of payment', 'buyer paid', 'did the buyer pay', 'payment proof', 'proof', 'reference', 'reference number', 'screenshot', 'receipt', 'payment received', 'reject payment', 'payment to verify', 'fake payment', 'not paid', 'awaiting new proof', 'na bayaran', 'nagbayad'],
    related: ['new-order', 'payments', 'returns'],
    links: [{ label: 'My orders', to: '/seller/orders' }],
    answer: [
      'For GCash / QR Ph orders the buyer enters a **reference number** and uploads a **payment proof** screenshot.',
      '1. Open the order (it shows **Payment to verify**).',
      '2. Check that the money reached your GCash or bank account.',
      '3. Tap **Payment received**. If it didn\'t arrive, tap **Reject payment**: the order stays and the buyer is asked for new proof (**Awaiting new proof**).',
      "You can confirm an order before checking the payment, but you can't fulfil it until the payment is verified. Emoorm never holds the money: buyers pay you directly.",
    ].join('\n'),
  },
  {
    id: 'cancel-order',
    title: 'Cancelling orders, expiry and refunds due',
    keywords: ['cancel', 'cancel order', 'cancelled', 'cancellation', 'expire', 'expired', '48 hours', 'refund due', 'mark refunded', 'kanselahin', 'buyer cancelled'],
    related: ['new-order', 'returns', 'today'],
    links: [{ label: 'My orders', to: '/seller/orders' }],
    answer: [
      '- You can **Cancel Order** at any step before it is delivered or picked up; the stock goes back.',
      '- Buyers can cancel only while the order is New or Confirmed.',
      '- New orders you don\'t confirm within 48 hours are cancelled automatically (not while a payment proof is waiting for you to check).',
      '- Cancelling a prepaid order you already verified shows **Refund due**: send the money back, then tap **Mark refunded**.',
      'Many cancellations (30% or more of at least 3 orders in 30 days) put your shop health at **Needs attention**.',
    ].join('\n'),
  },
  {
    id: 'delivery',
    title: 'Delivery areas and fees',
    keywords: ['delivery', 'deliver', 'delivery area', 'delivery areas', 'delivery fee', 'fee', 'shipping', 'shipping fee', 'barangay', 'town', 'towns', 'municipality', 'all around mindoro', 'free delivery', 'where do you deliver', 'courier', 'rider', 'padala', 'singil', 'sf'],
    related: ['payments', 'start-selling', 'new-order'],
    links: [{ label: 'Delivery areas & fees', to: '/seller/fulfillment/delivery' }],
    answer: [
      'Open **Me › Delivery & payment › Delivery areas & fees** (computers: **My Shop › Fulfillment & Payment**) and answer two questions:',
      '1. **Where do you deliver?** Only in your town, some towns, or all around Mindoro. In each town choose all barangays or only some.',
      '2. **How much is delivery?** Free delivery, the same fee everywhere, or a fee for each town or barangay (₱0 to ₱10,000; each can be Free).',
      "Buyers pay the fee for their barangay or town, otherwise your standard fee. Pickup is always free. Buyers outside your areas can only choose pickup.",
    ].join('\n'),
  },
  {
    id: 'pickup',
    title: 'Pickup and how buyers get orders',
    keywords: ['pickup', 'pick up', 'pickup spot', 'pickup address', 'pickup instructions', 'delivery or pickup', 'both', 'delivery only', 'pickup only', 'meet up', 'kunin', 'claim'],
    related: ['delivery', 'new-order', 'payments'],
    links: [
      { label: 'Delivery & pickup', to: '/seller/fulfillment/method' },
      { label: 'Pickup spot', to: '/seller/fulfillment/pickup' },
    ],
    answer: [
      'Choose how buyers get their orders in **Me › Delivery & payment › Delivery & pickup**: **Delivery only**, **Pickup only**, or **Both**.',
      'If you offer pickup, set your **Pickup spot** (town, barangay, and a street or landmark) and optional pickup instructions.',
      'Pickup orders go **Ready for Pickup** › **Mark Picked Up** (with a proof photo) › **Mark Completed**. Pickup is free for buyers.',
    ].join('\n'),
  },
  {
    id: 'payments',
    title: 'How buyers pay: cash, GCash and QR Ph',
    keywords: ['payment', 'payments', 'pay', 'paid', 'gcash', 'qr', 'qr ph', 'qrph', 'maya', 'bank', 'cash', 'cod', 'cash on delivery', 'cash on pickup', 'account name', 'account number', 'payment options', 'bayad', 'magbayad', 'how buyers pay', 'qr code'],
    related: ['new-order', 'delivery', 'start-selling'],
    links: [{ label: 'Payment options', to: '/seller/fulfillment/payment' }],
    answer: [
      'Set it in **Me › Delivery & payment › Payment options** (computers: **My Shop › Fulfillment & Payment**):',
      '- **Cash on delivery** (or cash on pickup): buyers pay when they get the order.',
      '- **QR payment**: pick **GCash** or **QR Ph**, enter the account name and number (a GCash number like 0917 123 4567), and upload your QR.',
      'Keep at least one on. With QR payment, buyers scan your QR or send to your number, then enter the reference and upload proof; you check it and tap **Payment received**. Emoorm never holds the money.',
    ].join('\n'),
  },
  {
    id: 'not-showing',
    title: 'Why buyers cannot see products',
    keywords: ['not showing', 'cant see', 'can t see', 'cannot see', 'see my products', 'buyers see', 'not visible', 'invisible', 'not live', 'not live yet', 'buyers cant find', 'no one sees', 'nobody sees', 'not appearing', 'hidden', 'di makita', 'hindi makita', 'hindi lumalabas', 'where is my product', 'private'],
    related: ['start-selling', 'add-product', 'more-sales'],
    answer: notShowing,
    links: notShowingLinks,
    facts: 'Buyers see a product only when the shop is approved, active (not Inactive), not suspended and ready to sell, and the product itself is live (not hidden, pending approval, suspended or archived). Products of a shop that is not ready to sell show "Not live yet". A new shop is private until the municipal admin approves it.',
  },
  {
    id: 'returns',
    title: 'Returns and refunds',
    keywords: ['return', 'returns', 'refund', 'refunds', 'return request', 'damaged', 'wrong item', 'not as described', 'missing item', 'record refund', 'approve return', 'reject return', 'ibalik', 'sira', 'money back'],
    related: ['new-order', 'today', 'more-sales'],
    links: [{ label: 'Returns & refunds', to: '/seller/returns' }],
    answer: [
      'Buyers can ask for a return within **7 days** of getting an order (damaged, wrong item, not as described, missing, or other). In **Returns & refunds**:',
      '1. **Approve** (set the approved amount) or **Reject** with a reason.',
      '2. If you need the item back, keep **Requires physical return** on, and tap **Mark items received** when it arrives.',
      '3. **Record refund**: the method (GCash, Bank transfer, Cash or Manual), the amount and a reference.',
      "The refund lowers your earnings. Stock isn't added back by itself, so add it back in My products if the item can be sold again.",
    ].join('\n'),
  },
  {
    id: 'reviews',
    title: 'Reviews and replies',
    keywords: ['review', 'reviews', 'rating', 'ratings', 'star', 'stars', 'reply to review', 'bad review', 'negative review', 'delete review', 'report review', 'feedback from buyers'],
    related: ['more-sales', 'today', 'returns'],
    links: [{ label: 'Reviews', to: '/seller/reviews' }],
    answer: [
      'Open **Reviews** (phones: Home › Reviews). Filter by **Needs reply**, tap **Reply**, write your answer (up to 1000 characters) and tap **Post Reply**; you can change it later with **Edit reply**. Replies are public.',
      "You can't delete or report a review. If one breaks the rules, message the admin. An average under 3★ (from at least 3 reviews) puts your shop health at **Needs attention**.",
    ].join('\n'),
  },
  {
    id: 'more-sales',
    title: 'Getting more buyers',
    keywords: ['more buyers', 'more sales', 'more customers', 'customers', 'promote', 'promotion', 'marketing', 'announce', 'announcement', 'followers', 'follower', 'share shop', 'advertise', 'ads', 'boost', 'grow', 'dagdag benta', 'sales tips', 'tips', 'suki'],
    related: ['add-product', 'not-showing', 'today'],
    links: [
      { label: 'Marketing', to: '/seller/marketing' },
      { label: 'Decorate my shop', to: '/seller/decorate' },
    ],
    answer: [
      'Ways to bring in buyers:',
      '- **Marketing › Announce**: message your followers (5–280 characters, up to 2 a day).',
      '- **Promote a product**: send one of your live products to your followers.',
      '- **Share shop**: share your shop link anywhere.',
      '- **Decorate**: pick a template for your shop colours, and add a logo and banner.',
      '- Use clear photos and honest descriptions, keep delivery fees fair, confirm orders quickly and reply to chats and reviews.',
      'Announcements work once your shop is public and ready to sell.',
    ].join('\n'),
  },
  {
    id: 'vouchers',
    title: 'Vouchers and discounts',
    keywords: ['voucher', 'vouchers', 'discount', 'discounts', 'promo code', 'coupon', 'sale price', 'markdown'],
    related: ['more-sales', 'edit-product', 'add-product'],
    links: [{ label: 'My products', to: '/seller/products' }],
    answer: "Sellers can't create vouchers or discount codes: Emoorm's admins run vouchers. To offer a lower price, edit the product's price in **My products**, then tell your followers with **Marketing › Announce**.",
  },
  {
    id: 'earnings',
    title: 'Earnings, analytics and fees',
    keywords: ['earnings', 'earning', 'revenue', 'income', 'sales report', 'finance', 'money', 'payout', 'withdraw', 'wallet', 'commission', 'charge', 'charges', 'how much do you charge', 'free to sell', 'cost to sell', 'monthly fee', 'subscription', 'how much did i earn', 'analytics', 'performance', 'best selling', 'kinita', 'kita ko', 'export'],
    related: ['today', 'more-sales', 'new-order'],
    links: [
      { label: 'Finance', to: '/seller/finance' },
      { label: 'Analytics', to: '/seller/analytics' },
    ],
    answer: [
      '**Finance** (phones: Me › My earnings) shows Earned this period, Lifetime earnings, Orders in progress and Average order value, with your completed orders (you can export them).',
      'Only **completed** orders count as earnings, and refunds are taken off. **Analytics** (phones: Home › Performance) shows daily sales, best-selling products, sales by category and more.',
      'Emoorm is free to sell on and takes no commission. There is no wallet or payout: buyers pay you directly.',
    ].join('\n'),
  },
  {
    id: 'chat',
    title: 'Chatting with buyers',
    keywords: ['chat', 'message', 'messages', 'inbox', 'reply buyer', 'buyer message', 'customer message', 'contact buyer', 'mensahe', 'usap', 'quick reply'],
    related: ['new-order', 'today', 'more-sales'],
    links: [{ label: 'Chat', to: '/seller/messages' }],
    answer: [
      'Buyer chats are in the **Chat** tab (computers: **Messages**). Send text (up to 2000 characters) and photos, and attach an order or a product.',
      'You can start a chat only with buyers who have ordered from you. Quick replies win more orders.',
      'To talk to Emoorm instead, switch the Chat header from **Buyers** to **Municipal admin**.',
    ].join('\n'),
  },
  {
    id: 'admin-help',
    title: 'Getting help from Emoorm',
    keywords: ['admin', 'support', 'contact emoorm', 'report a problem', 'problem', 'complaint', 'customer service', 'municipal admin', 'case', 'ticket', 'tulong', 'help center', 'send feedback', 'report buyer', 'bogus buyer'],
    related: ['today', 'not-showing', 'new-order'],
    links: ADMIN_LINKS,
    answer: [
      'To reach Emoorm, open **Me › Message the admin** (computers: **Admin** in the sidebar) and start a **New support case**: choose what it is about, add a subject and the details. Replies come there, and you can rate the case once it is resolved.',
      'You can report a buyer from their order (for example "Did not pay for the order"), and send ideas with **Me › Send feedback**.',
    ].join('\n'),
  },
  {
    id: 'approval',
    title: 'Seller application and approval',
    keywords: ['approval', 'approve', 'approved', 'application', 'apply', 'applied', 'private', 'under review', 'when approved', 'rejected', 'not approved', 'reapply', 'sell on emoorm'],
    related: ['start-selling', 'not-showing', 'add-product'],
    links: [{ label: 'Shop setup', to: '/seller/setup' }],
    answer: [
      'After you apply, your shop is **private** until your municipal admin approves it (usually 1–2 business days). Meanwhile you can set it up and add products.',
      'Once approved you\'ll get **Seller Application Approved** and your shop goes public. If it isn\'t approved you\'ll see the reason, and you can apply again.',
      'Verifying your ID is not needed to sell, but admins approve verified shops faster.',
    ].join('\n'),
  },
  {
    id: 'verify-id',
    title: 'Verifying identity',
    keywords: ['verify', 'verify identity', 'verification', 'identity', 'id', 'valid id', 'government id', 'kyc', 'verified', 'beripika'],
    related: ['approval', 'start-selling', 'today'],
    links: [{ label: 'Verify identity', to: '/seller/verification' }],
    answer: [
      '**Verify identity** (Me › Settings › Verify identity) reads a Philippine government ID: take a photo of the front (the back is optional). The name on it, and the address if it shows one, must match your account.',
      "It isn't required to sell, but admins approve verified shops faster. You can try 5 times a day, and one ID can verify only one account. Changing your profile name or address means verifying again.",
    ].join('\n'),
  },
  {
    id: 'shop-profile',
    title: 'Shop profile and decorating',
    keywords: ['shop profile', 'shop name', 'rename', 'change name', 'description', 'logo', 'banner', 'cover', 'location', 'map', 'pin', 'colors', 'colours', 'color', 'theme', 'decorate', 'template', 'shop link', 'store link', 'design', 'storefront'],
    related: ['more-sales', 'start-selling', 'not-showing'],
    links: [
      { label: 'Shop profile', to: '/seller/store' },
      { label: 'Decorate my shop', to: '/seller/decorate' },
    ],
    answer: [
      'Edit your shop in **Me › Settings › Shop profile** (computers: **My Shop › Shop Profile**): name and description, logo and banner, location (a pin on the map), and shop colours.',
      '**Decorate my shop** has ready templates (Fresh Market, Island Blue, Sunset Crafts, Charcoal, Blossom Pink, Coffee & Cacao) that set your colours.',
      'Changing your shop name also changes your shop link.',
    ].join('\n'),
  },
  {
    id: 'close-shop',
    title: 'Pausing or deleting the shop',
    keywords: ['close shop', 'close my shop', 'pause', 'vacation', 'holiday', 'deactivate', 'inactive', 'turn off', 'delete shop', 'remove shop', 'stop selling', 'isara', 'deletion', 'cancel deletion'],
    related: ['shop-profile', 'today', 'admin-help'],
    links: [
      { label: 'Name & description', to: '/seller/store/about' },
      { label: 'Shop settings', to: '/seller/settings' },
    ],
    answer: [
      '- To pause selling, turn your shop **Inactive** in Me › Shop profile › Name & description (computers: the **Store is Active** switch in Shop Profile). It hides your shop and products until you turn it back on.',
      '- **Delete Shop** (Me › Settings › Shop settings) hides your shop at once and deletes it for good after 15 days, unless you tap **Cancel Deletion** before then.',
    ].join('\n'),
  },
  {
    id: 'suspended',
    title: 'Suspended shop',
    keywords: ['suspended', 'suspension', 'banned', 'blocked', 'disabled', 'shop suspended', 'store suspended'],
    related: ['admin-help', 'not-showing', 'today'],
    links: ADMIN_LINKS,
    answer: "If an admin suspends your shop you'll see **Your store has been suspended**, with the reason. Your shop is hidden, buyers can't order, and you can't add or edit products. Message the admin to sort it out; you'll get **Your store is active again** once it's lifted.",
  },
  {
    id: 'shop-health',
    title: 'Shop health',
    keywords: ['shop health', 'health', 'needs attention', 'excellent', 'good health', 'shop score', 'cancel rate'],
    related: ['today', 'reviews', 'cancel-order'],
    links: [{ label: 'Me', to: '/seller/menu' }],
    answer: [
      'Shop health (on the Me tab) is:',
      '- **Excellent**: no issues.',
      '- **Good**: only small ones (no live products, or no orders in 30 days).',
      "- **Needs attention**: your shop isn't ready to sell, 30% or more of your orders were cancelled in 30 days (at least 3 orders), or your reviews average under 3★ (at least 3 reviews).",
    ].join('\n'),
  },
  {
    id: 'account',
    title: 'Seller login and switching accounts',
    keywords: ['login', 'log in', 'sign in', 'password', 'seller login', 'switch account', 'buyer account', 'switch to buyer', 'logout', 'log out', 'google', 'forgot password', 'two step', 'mfa'],
    related: ['today', 'admin-help', 'start-selling'],
    links: [{ label: 'Me', to: '/seller/menu' }],
    answer: 'Use **Seller Login** (top right of the login page) to open the Seller Center; the normal login opens your buyer side. Switch sides with **Me › Switch to my buyer account**. Forgot your password? Tap **Forgot?** on the login page.',
  },
];

/* ── The suggested questions ───────────────────────────────────────── */

const PRESETS = [
  { id: 'start-selling', topic: 'start-selling', question: 'What do I still need to start selling?' },
  { id: 'today', topic: 'today', question: 'What needs my attention today?' },
  { id: 'add-product', topic: 'add-product', question: 'How do I add a product?' },
  { id: 'new-order', topic: 'new-order', question: 'What do I do with a new order?' },
  { id: 'delivery', topic: 'delivery', question: 'How do I set delivery areas and fees?' },
  { id: 'payments', topic: 'payments', question: 'How do buyers pay me?' },
  { id: 'not-showing', topic: 'not-showing', question: "Why can't buyers see my products?" },
  { id: 'returns', topic: 'returns', question: 'How do returns and refunds work?' },
  { id: 'more-sales', topic: 'more-sales', question: 'How can I get more buyers?' },
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
];

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
];

module.exports = {
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
  GREETING,
  ABOUT_QUESTION,
  OFF_TOPIC_PATTERNS,
};
