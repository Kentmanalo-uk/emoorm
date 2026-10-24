/*
 * E-MOORM Seller Academy: free lessons on selling on E-MOORM, in short,
 * plain sentences for people new to selling online (and to English). Every
 * rule here is how the app works today; when a rule changes in the app,
 * change it here too.
 *
 * A lesson: slug, screen (the app screenshot shown in a phone beside it),
 * stage, Icon, tone, title, summary, minutes, visual (one picture or
 * diagram), steps, tips, dos, donts, action (where to try it).
 * Visual kinds: photos (example pictures), flow (icons in order with
 * arrows), cards (a few icon cards). A step can carry its own screen; tapping
 * it shows that screen in the phone.
 */
import {
  Storefront, RocketLaunch, Gear, PlusCircle, Camera, Tag, CookingPot, Clock, Package,
  CurrencyCircleDollar, Truck, ChatsCircle, Star, Megaphone, ShieldCheck,
  Bell, CheckCircle, HandHeart, MapPin, Money, QrCode, Moped, Receipt,
  ArrowsClockwise, Ticket, ShareNetwork, SealCheck, ChartLineUp,
  Eye, ArrowsOutSimple, Basket, Cow, Gift, Headset, Robot, Key, UserPlus, ImageSquare,
} from '@phosphor-icons/react';

export const STAGES = [
  { key: 'start', title: 'Get started', text: 'Open your free shop and get it ready.' },
  { key: 'list', title: 'List your products', text: 'Show buyers what you sell, the right way.' },
  { key: 'orders', title: 'Orders and money', text: 'Handle orders, get paid and deliver.' },
  { key: 'grow', title: 'Grow your shop', text: 'Get more buyers and keep them happy.' },
];

export const LESSONS = [
  // ── Get started ──────────────────────────────────────────────────
  {
    slug: 'welcome',
    screen: { src: '/tutorial/sell-steps.webp', caption: 'Why sellers join E-MOORM' },
    stage: 'start',
    Icon: HandHeart,
    tone: 'green',
    title: 'Welcome to E-MOORM',
    summary: 'What E-MOORM is and why it is good for your business.',
    minutes: 2,
    visual: {
      kind: 'cards',
      items: [
        { Icon: Storefront, title: 'Free shop', text: 'No fee to open. No fee to list.' },
        { Icon: Money, title: 'No commission', text: 'What the buyer pays is yours.' },
        { Icon: MapPin, title: 'Local buyers', text: 'People in Oriental Mindoro find you.' },
        { Icon: SealCheck, title: 'Trusted', text: 'Your town checks every shop.' },
      ],
    },
    steps: [
      { screen: { src: '/tutorial/live-home.webp', caption: 'Local products and shops on the home page' }, title: 'It is an online market for Oriental Mindoro', text: 'Farmers, fishers, cooks and makers sell here. Buyers in the province shop here.' },
      { screen: { src: '/tutorial/academy/payment.webp', caption: 'Buyers pay you: cash, or your own GCash or QR Ph' }, title: 'You keep all your money', text: 'Buyers pay you directly: cash, GCash or QR Ph. E-MOORM does not take a cut.' },
      { screen: { src: '/tutorial/academy/support.webp', caption: 'Your municipal admin answers you here' }, title: 'Your town helps you', text: "The admin of your town checks your shop and helps you when you have a problem." },
      { screen: { src: '/tutorial/seller-home.webp', caption: 'Your Seller Center on a phone' }, title: 'You can use a phone', text: 'Everything works on the website and on the E-MOORM Android app.' },
    ],
    tips: ['Learn one lesson at a time. Try each step in your shop right after.'],
    action: { label: 'See how selling works', to: '/sell' },
  },
  {
    slug: 'open-your-shop',
    screen: { src: '/tutorial/apply.webp', caption: 'The seller application' },
    stage: 'start',
    Icon: RocketLaunch,
    tone: 'green',
    title: 'Open your shop',
    summary: 'Apply in 5 short steps. Your town admin checks it.',
    minutes: 3,
    visual: {
      kind: 'flow',
      items: [
        { Icon: UserPlus, label: 'Make an account' },
        { Icon: Storefront, label: 'Apply in 5 steps' },
        { Icon: SealCheck, label: 'Town admin checks' },
        { Icon: RocketLaunch, label: 'Start selling' },
      ],
    },
    steps: [
      { screen: { src: '/tutorial/register.webp', caption: 'Sign up with your name and email' }, title: 'Make an account', text: 'Sign up with your name and email. Add your mobile number to your profile.' },
      { screen: { src: '/tutorial/sell-steps.webp', caption: 'The Start selling button' }, title: 'Tap "Start selling"', text: 'Fill in 5 short parts: About you, Your shop, Where your shop is, Selling as, How buyers pay.' },
      { screen: { src: '/tutorial/apply.webp', caption: 'The shop name must be new on E-MOORM' }, title: 'Pick a good shop name', text: 'Use a name buyers remember, like "Aling Rosa\'s Farm". Two shops cannot have the same name.' },
      { screen: { src: '/tutorial/seller-welcome.webp', caption: 'The town admin is reviewing your shop' }, title: 'Wait for approval', text: 'The admin of your shop\'s town checks it, usually in 1 to 2 working days. You get a message.' },
      { screen: { src: '/tutorial/seller-home.webp', caption: 'Your Seller Center opens right away' }, title: 'Start while you wait', text: 'Your Seller Center opens right away. Add products now. Buyers see them after approval.' },
    ],
    tips: [
      'If your application is not approved, you will see the reason. Fix it and apply again.',
      'Choose the town where your shop really is. That town\'s admin checks it.',
    ],
    dos: ['Use your real name and real shop address', 'Check your phone number'],
    donts: ['Do not copy another shop\'s name or photos'],
    action: { label: 'Apply to sell', to: '/seller/apply', seller: false },
  },
  {
    slug: 'set-up-your-shop',
    screen: { src: '/tutorial/seller-home.webp', caption: 'Complete your shop, one item at a time' },
    stage: 'start',
    Icon: Gear,
    tone: 'green',
    title: 'Get your shop ready',
    summary: 'Logo, banner, delivery and payment. Buyers can order only when this is done.',
    minutes: 3,
    visual: {
      kind: 'cards',
      items: [
        { Icon: ImageSquare, title: 'Logo and banner', text: 'Your shop looks real' },
        { Icon: Truck, title: 'Delivery or pickup', text: 'How buyers get orders' },
        { Icon: QrCode, title: 'Payment', text: 'Cash, GCash or QR Ph' },
        { Icon: Clock, title: 'Shop hours', text: 'When you reply' },
      ],
    },
    steps: [
      { screen: { src: '/tutorial/seller-home.webp', caption: 'The "Complete your shop" checklist' }, title: 'Follow "Complete your shop"', text: 'Your Seller Center home shows a checklist. Do each item from top to bottom.' },
      { screen: { src: '/tutorial/academy/branding.webp', caption: 'Logo & banner' }, title: 'Add a logo and a banner', text: 'A clear logo and a nice banner make your shop look real and trusted.' },
      { screen: { src: '/tutorial/academy/fulfillment-method.webp', caption: 'Delivery only, Pickup only, or Both' }, title: 'Choose how buyers get orders', text: 'Pickup at your shop, delivery, or both. Set your pickup spot and delivery fees.' },
      { screen: { src: '/tutorial/academy/payment.webp', caption: 'Payment options: cash and QR payment' }, title: 'Choose how buyers pay', text: 'Cash (on delivery or at pickup), and your own GCash or QR Ph code if you have one.' },
      { screen: { src: '/tutorial/academy/settings.webp', caption: 'Opening hours, in Settings' }, title: 'Set your shop hours', text: 'In Settings, tap Opening hours. Buyers then know when you are open and when to expect a reply.' },
    ],
    tips: ['Buyers cannot order until your shop has a way to deliver (or pickup) and a way to pay.'],
    action: { label: 'Open shop settings', to: '/seller/fulfillment', seller: true },
  },

  // ── List your products ───────────────────────────────────────────
  {
    slug: 'add-a-product',
    screen: { src: '/tutorial/form-basics.webp', caption: 'Adding a product in the app' },
    stage: 'list',
    Icon: PlusCircle,
    tone: 'blue',
    title: 'Add your first product',
    summary: 'Photo, name, category, price and stock. Then check the preview.',
    minutes: 3,
    visual: {
      kind: 'flow',
      items: [
        { Icon: Camera, label: 'Add photos' },
        { Icon: Tag, label: 'Name and category' },
        { Icon: CurrencyCircleDollar, label: 'Price and stock' },
        { Icon: Eye, label: 'Check the preview' },
        { Icon: CheckCircle, label: 'Save' },
      ],
    },
    steps: [
      { screen: { src: '/tutorial/seller-products.webp', caption: 'The + button in My products' }, title: 'Tap "Add product"', text: 'In your Seller Center, tap the + Add product button.' },
      { screen: { src: '/tutorial/academy/products-new.webp', caption: 'The first photo is the one buyers see first' }, title: 'Add photos', text: 'Add 1 to 10 photos. The first photo is the cover buyers see first.' },
      { screen: { src: '/tutorial/form-basics.webp', caption: 'Name and category' }, title: 'Write the name and pick a category', text: 'Example: "Lakatan Bananas (1 kg)". Pick the category that fits, like Fruits.' },
      { screen: { src: '/tutorial/form-details.webp', caption: 'How many you have now' }, title: 'Set the price and stock', text: 'Price is for one item. Stock is how many you have now.' },
      { screen: { src: '/tutorial/form-review.webp', caption: 'The last step: check it, then add it' }, title: 'Check it and save', text: 'The last step shows what buyers will see. Fix anything that looks wrong, then tap Add product (Put on sale on the website).' },
    ],
    tips: ['Your product goes live right away when your shop is approved and open.'],
    dos: ['Say the size or weight in the name', 'Keep the stock number correct'],
    donts: ['Do not post things you do not have', 'Do not use photos from the internet'],
    action: { label: 'Add a product', to: '/seller/products/new', seller: true },
  },
  {
    slug: 'good-photos',
    screen: { src: '/tutorial/product-mango.webp', caption: 'A good photo, as buyers see it' },
    stage: 'list',
    Icon: Camera,
    tone: 'blue',
    title: 'Take photos that sell',
    summary: 'Good photos get more buyers. You only need your phone.',
    minutes: 2,
    visual: {
      kind: 'photos',
      items: [
        { src: '/tutorial/photo-mango.webp', label: 'Bright and clear' },
        { src: '/tutorial/photo-vegetables.webp', label: 'Show it all' },
        { src: '/tutorial/photo-seafood.webp', label: 'Looks fresh' },
        { src: '/tutorial/photo-hens.webp', label: 'Real and live' },
      ],
    },
    steps: [
      { screen: { src: '/tutorial/product-mango.webp', caption: 'A bright photo taken in daylight' }, title: 'Use daylight', text: 'Take photos near a window or outside in the morning. Do not use the flash.' },
      { title: 'Use a plain background', text: 'A clean table, a banana leaf or a plain cloth. Nothing messy behind.' },
      { screen: { src: '/tutorial/store-products.webp', caption: 'The whole item in every photo' }, title: 'Show the whole item', text: 'Buyers want to see all of it. Add a close-up too.' },
      { title: 'Take more than one', text: 'Front, side, inside, and the size next to your hand.' },
      { title: 'Hold your phone still', text: 'Tap the screen to focus. A blurry photo looks old.' },
    ],
    tips: ['Wipe your phone camera with a soft cloth first. It makes photos much clearer.'],
    dos: ['Real photos of your own products', 'Bright, sharp, the item in the middle'],
    donts: ['Dark or blurry photos', 'Photos with words or other shop logos on them'],
    action: { label: 'Update my photos', to: '/seller/products', seller: true },
  },
  {
    slug: 'price-and-words',
    screen: { src: '/tutorial/store-products.webp', caption: 'Names that say what and how much' },
    stage: 'list',
    Icon: Tag,
    tone: 'blue',
    title: 'Price and words that sell',
    summary: 'A clear name, an honest price and a short, true description.',
    minutes: 3,
    visual: {
      kind: 'cards',
      items: [
        { Icon: Tag, title: 'Name', text: '"Dried Danggit (250 g)"' },
        { Icon: CurrencyCircleDollar, title: 'Price', text: 'Fair, like at the market' },
        { Icon: Eye, title: 'Description', text: 'What, how big, how fresh' },
        { Icon: ArrowsOutSimple, title: 'Choices', text: 'Sizes or flavors, each with its price' },
      ],
    },
    steps: [
      { screen: { src: '/tutorial/store-products.webp', caption: '"Red Onions (1 kg)": what, and how much' }, title: 'Name: what + size', text: 'Write what it is and how much. "Calamansi (1 kg)" is better than "Fresh!!!".' },
      { screen: { src: '/tutorial/cart.webp', caption: 'Your price, plus the delivery fee' }, title: 'Price: check the market', text: 'Look at similar products on E-MOORM. Remember the delivery fee is added.' },
      { screen: { src: '/tutorial/form-basics.webp', caption: 'The description, at the bottom' }, title: 'Description: 3 short lines', text: 'What it is. Where it comes from. How to keep it. Short sentences are fine.' },
      { title: 'Use choices for sizes', text: 'Selling small and big? Add choices. Each choice can have its own price and stock.' },
      { title: 'Run a sale sometimes', text: 'Set a sale price with dates. Buyers who saved your product get a message.' },
    ],
    tips: ['Tell the truth. A happy buyer comes back. An unhappy buyer leaves a bad review.'],
    action: { label: 'Edit my products', to: '/seller/products', seller: true },
  },
  {
    slug: 'kinds-of-products',
    screen: { src: '/tutorial/form-animal.webp', caption: 'Adding a live animal' },
    stage: 'list',
    Icon: Basket,
    tone: 'blue',
    title: 'Kinds of products',
    summary: 'Regular goods, cooked food, paluto, live animals and packages.',
    minutes: 3,
    visual: {
      kind: 'cards',
      items: [
        { Icon: Package, title: 'Regular product', text: 'Things you keep in stock, like banana chips' },
        { Icon: CookingPot, title: 'Ready to eat', text: 'Cooked food you sell today, like pancit' },
        { Icon: Clock, title: 'Paluto', text: 'Food you cook only after someone orders' },
        { Icon: Cow, title: 'Live animal', text: 'Sold per head, like a native pig' },
        { Icon: Gift, title: 'Package', text: 'Some of your products together, one price' },
      ],
    },
    steps: [
      { title: 'Pick the kind when you add a product', text: 'For food and animals, E-MOORM asks "What kind is it?". Pick the one that fits.' },
      { screen: { src: '/tutorial/form-ready.webp', caption: 'Ready-to-eat food: today\'s post' }, title: 'Ready to eat food', text: 'Post it on Today\'s menu with the time it is ready (see the next lesson).' },
      { title: 'Paluto', text: 'No stock to count. You cook after the order comes in. Say how long it takes.' },
      { screen: { src: '/tutorial/product-hens.webp', caption: 'A live animal, priced per head' }, title: 'Live animals', text: 'Show a price per head. Buyers send an offer in Messages. You accept, change the price, or say no.' },
      { screen: { src: '/tutorial/seller-products.webp', caption: '"Create a package" in My products' }, title: 'Packages', text: 'Put some of your products together, like a fiesta set, and give it one price.' },
    ],
    tips: ['For live animals, set a meetup in the chat so the buyer can see the animals first.'],
    action: { label: 'Add a product', to: '/seller/products/new', seller: true },
  },
  {
    slug: 'todays-menu',
    screen: { src: '/tutorial/academy/today.webp', caption: 'Today\'s menu' },
    stage: 'list',
    Icon: CookingPot,
    tone: 'blue',
    title: "Today's menu",
    summary: 'Sell cooked food for a short time: ready now, cooked when ordered, or pre-order.',
    minutes: 2,
    visual: {
      kind: 'flow',
      items: [
        { Icon: CookingPot, label: 'Post your menu' },
        { Icon: Clock, label: 'Buyers order in your time' },
        { Icon: Bell, label: 'Confirm in 45 minutes' },
        { Icon: HandHeart, label: 'Hand it over hot' },
      ],
    },
    steps: [
      { screen: { src: '/tutorial/academy/today.webp', caption: 'Today\'s menu: add food from My products' }, title: 'Open Today\'s menu', text: 'In your Seller Center, tap Today\'s menu. Add your food from My products, then post it for today.' },
      { screen: { src: '/tutorial/academy/today-new.webp', caption: 'Is it ready now? Pick one' }, title: 'Choose one way', text: 'Ready now (already cooked), Cooked when ordered (you cook after the order) or Pre-order (buyers get it later, like tomorrow morning).' },
      { screen: { src: '/tutorial/academy/today-new.webp', caption: 'How many each day, and until when' }, title: 'Set the time and how many', text: 'Say how many plates or packs you have each day, and until what time buyers can order.' },
      { screen: { src: '/tutorial/seller-orders.webp', caption: 'Confirm each order in time' }, title: 'Confirm orders fast', text: 'Confirm each order within 45 minutes. If not, it is cancelled.' },
    ],
    tips: ['When the time ends, the food leaves the menu by itself. Post again tomorrow.'],
    action: { label: "Open Today's menu", to: '/seller/today', seller: true },
  },

  // ── Orders and money ─────────────────────────────────────────────
  {
    slug: 'handle-orders',
    screen: { src: '/tutorial/seller-orders.webp', caption: 'A new order, ready to confirm' },
    stage: 'orders',
    Icon: Receipt,
    tone: 'amber',
    title: 'Handle an order',
    summary: 'Confirm, prepare, hand over. Each step tells the buyer.',
    minutes: 3,
    visual: {
      kind: 'flow',
      items: [
        { Icon: Bell, label: 'New order' },
        { Icon: CheckCircle, label: 'Confirm' },
        { Icon: Package, label: 'Pack' },
        { Icon: Truck, label: 'Deliver or ready for pickup' },
        { Icon: Star, label: 'Done' },
      ],
    },
    steps: [
      { screen: { src: '/tutorial/seller-notifications.webp', caption: 'The notice for a new order' }, title: 'A new order comes in', text: 'You get a notification. Open My orders and look at the New tab.' },
      { screen: { src: '/tutorial/seller-orders.webp', caption: 'The Confirm order button' }, title: 'Confirm it', text: 'Check you have the items, then tap Confirm order. Confirm within 48 hours or it is cancelled.' },
      { title: 'Pack it', text: 'Tap Start packing so the buyer knows you are working on it. Pack it well.' },
      { title: 'Hand it over', text: 'Tap Ready for pickup, or deliver it yourself, call a rider, or tap Ship with courier.' },
      { title: 'Finish', text: 'Tap Mark delivered or Mark picked up. The order is done, and the buyer can leave a review.' },
    ],
    tips: ['Every change is saved in the order history. If there is a problem later, the history shows what happened.'],
    dos: ['Confirm orders quickly', 'Message the buyer if something changes'],
    donts: ['Do not confirm an order you cannot fill'],
    action: { label: 'Open my orders', to: '/seller/orders', seller: true },
  },
  {
    slug: 'get-paid',
    screen: { src: '/tutorial/academy/payment.webp', caption: 'Payment options' },
    stage: 'orders',
    Icon: CurrencyCircleDollar,
    tone: 'amber',
    title: 'Get paid safely',
    summary: 'Cash on delivery, GCash and QR Ph. The money goes straight to you.',
    minutes: 3,
    visual: {
      kind: 'cards',
      items: [
        { Icon: Money, title: 'Cash on delivery', text: 'The buyer pays cash when they get it' },
        { Icon: QrCode, title: 'GCash / QR Ph', text: 'The buyer scans your own QR code' },
        { Icon: Receipt, title: 'Proof', text: 'The buyer sends the reference number and a screenshot' },
      ],
    },
    steps: [
      { screen: { src: '/tutorial/academy/payment.webp', caption: 'Turn on QR payment' }, title: 'Add your QR code', text: 'In Payment options, turn on QR payment and add your GCash or QR Ph code. You can also turn on cash.' },
      { title: 'For QR payments', text: 'After you confirm, the buyer pays your QR code and sends the reference number and a screenshot.' },
      { title: 'Check your GCash first', text: 'Open your GCash or bank app. See the money really arrived. Then tap Confirm payment and start packing.' },
      { screen: { src: '/tutorial/academy/payment.webp', caption: 'Cash: buyers pay when they get their order' }, title: 'For cash', text: 'Turn on cash in Payment options. Get the cash when you hand over the order. The order is marked paid then.' },
    ],
    tips: ['E-MOORM never asks for your PIN or a one-time code (OTP). Never give them to anyone.'],
    dos: ['Check the money in your own app', 'Keep payments inside E-MOORM orders'],
    donts: ['Do not trust a screenshot alone', 'Do not ask buyers to pay outside E-MOORM'],
    action: { label: 'Set payment options', to: '/seller/fulfillment/payment', seller: true },
  },
  {
    slug: 'delivery-and-pickup',
    screen: { src: '/tutorial/academy/fulfillment-method.webp', caption: 'Delivery & pickup' },
    stage: 'orders',
    Icon: Truck,
    tone: 'amber',
    title: 'Delivery and pickup',
    summary: 'Set your fees once. Buyers see them before they order.',
    minutes: 3,
    visual: {
      kind: 'cards',
      items: [
        { Icon: Storefront, title: 'Pickup', text: 'The buyer comes to your pickup spot' },
        { Icon: Truck, title: 'You deliver', text: 'Free, a fee per place, or by distance' },
        { Icon: Package, title: 'Courier', text: 'For other towns, with a tracking number' },
        { Icon: Moped, title: 'MoorMove rider', text: 'Where riders are on, tap Call a rider' },
      ],
    },
    steps: [
      { screen: { src: '/tutorial/academy/fulfillment-method.webp', caption: 'Delivery only, Pickup only, or Both' }, title: 'Choose pickup, delivery or both', text: 'Open your delivery and pickup settings. Pick what works for you.' },
      { screen: { src: '/tutorial/academy/fulfillment-pickup.webp', caption: 'Address, landmark and map pin' }, title: 'Set your pickup spot', text: 'Write the address and a landmark. Pin it on the map.' },
      { screen: { src: '/tutorial/academy/fulfillment-fees.webp', caption: 'Free delivery, Fee per place or By distance' }, title: 'Set your delivery fee', text: 'Free delivery, a fee per place (town or barangay), or a fee by distance (km).' },
      { screen: { src: '/tutorial/academy/fulfillment-delivery.webp', caption: 'Who delivers your orders' }, title: 'Far away? Use a courier', text: 'Choose a courier. Tap Ship with courier and add the tracking number so the buyer can follow it.' },
      { title: 'Call a rider', text: 'Where MoorMove riders work, tap Call a rider after packing. For cash orders the rider brings the money back. Tap "Cash received".' },
    ],
    tips: ['Only deliver to places you can really reach. Buyers outside your areas can still pick up.'],
    action: { label: 'Set delivery and pickup', to: '/seller/fulfillment', seller: true },
  },

  // ── Grow your shop ───────────────────────────────────────────────
  {
    slug: 'talk-to-buyers',
    screen: { src: '/tutorial/academy/questions.webp', caption: 'Buyer questions' },
    stage: 'grow',
    Icon: ChatsCircle,
    tone: 'violet',
    title: 'Talk to buyers',
    summary: 'Reply fast and kindly. Answer questions on your products.',
    minutes: 2,
    visual: {
      kind: 'flow',
      items: [
        { Icon: ChatsCircle, label: 'Buyer asks' },
        { Icon: Clock, label: 'Reply soon' },
        { Icon: HandHeart, label: 'Be kind and clear' },
        { Icon: Receipt, label: 'Buyer orders' },
      ],
    },
    steps: [
      { screen: { src: '/tutorial/seller-home.webp', caption: 'Chat is in your bottom bar' }, title: 'Check Messages every day', text: 'Buyers message you before they buy. A fast reply often means a sale.' },
      { screen: { src: '/tutorial/academy/questions.webp', caption: 'Questions to answer' }, title: 'Answer product questions', text: 'Buyers can ask on your product page. Answer them in Questions: your answer helps other buyers too.' },
      { title: 'Be clear', text: 'Say the price, the size and when it is ready. Short and polite is best.' },
      { title: 'Keep the chat in E-MOORM', text: 'Then there is a record if there is a problem, and your town admin can help.' },
    ],
    tips: ['Turn on notifications so you know when a buyer writes.'],
    action: { label: 'Open messages', to: '/seller/messages', seller: true },
  },
  {
    slug: 'reviews-and-returns',
    screen: { src: '/tutorial/academy/reviews.webp', caption: 'Your reviews' },
    stage: 'grow',
    Icon: Star,
    tone: 'violet',
    title: 'Reviews and returns',
    summary: 'Good reviews bring buyers. Handle returns fairly.',
    minutes: 3,
    visual: {
      kind: 'flow',
      items: [
        { Icon: ArrowsClockwise, label: 'Buyer asks to return' },
        { Icon: Eye, label: 'You look at the photos' },
        { Icon: CheckCircle, label: 'Accept or say why not' },
        { Icon: Headset, label: 'Town admin helps if they disagree' },
      ],
    },
    steps: [
      { screen: { src: '/tutorial/academy/reviews.webp', caption: 'Buyers review after the order is done' }, title: 'Reviews', text: 'After an order is done, the buyer can give stars and a short review with photos.' },
      { screen: { src: '/tutorial/academy/reviews.webp', caption: '"Needs reply": reviews to answer' }, title: 'Reply to reviews', text: 'Say thank you. If a review is bad, reply calmly and offer to help.' },
      { screen: { src: '/tutorial/academy/returns.webp', caption: 'Returns & refunds' }, title: 'Return requests', text: 'A buyer can ask to return an item that is damaged, wrong or not as shown, within your return time (7 days if you set none).' },
      { title: 'Decide fairly', text: 'Accept, or say no with a clear reason. If the buyer disagrees, your town admin decides.' },
    ],
    tips: ['Write your return rule in the product. For fresh food, a short time like 2 days is normal.'],
    action: { label: 'See my reviews', to: '/seller/reviews', seller: true },
  },
  {
    slug: 'get-more-buyers',
    screen: { src: '/tutorial/academy/marketing.webp', caption: 'Marketing' },
    stage: 'grow',
    Icon: Megaphone,
    tone: 'violet',
    title: 'Get more buyers',
    summary: 'Share your shop, tell your followers, give vouchers.',
    minutes: 3,
    visual: {
      kind: 'cards',
      items: [
        { Icon: ShareNetwork, title: 'Share your link', text: 'Send it to friends and Facebook groups' },
        { Icon: QrCode, title: 'Shop QR poster', text: 'Print it and put it at your stall' },
        { Icon: Megaphone, title: 'Announcements', text: 'Tell your followers news, 2 a day' },
        { Icon: Ticket, title: 'Vouchers', text: 'A discount code for your shop' },
        { Icon: SealCheck, title: 'Verified badge', text: 'Verify your ID. Buyers trust it' },
        { Icon: ChartLineUp, title: 'Analytics', text: 'See what sells best' },
      ],
    },
    steps: [
      { screen: { src: '/tutorial/store.webp', caption: 'The Share button on your shop page' }, title: 'Share your shop', text: 'Tap Share on your shop page (or Share shop in Marketing). Send the link in chats and groups you are in.' },
      { screen: { src: '/tutorial/academy/shop-qr.webp', caption: 'Shop QR: pick a design, print it' }, title: 'Print your Shop QR', text: 'Buyers at your stall scan it and follow your shop.' },
      { screen: { src: '/tutorial/academy/marketing.webp', caption: 'Announce, in Marketing' }, title: 'Post announcements', text: 'New harvest? A sale? In Marketing, tap Announce to tell your followers. You can send 2 a day.' },
      { screen: { src: '/tutorial/academy/marketing.webp', caption: 'Shop vouchers, in Marketing' }, title: 'Give a voucher', text: 'In Marketing, under Shop vouchers, tap New. Make a code like "FRESH20" for an amount or percent off.' },
      { screen: { src: '/tutorial/academy/verification.webp', caption: 'Verify with a government ID' }, title: 'Verify your identity', text: 'Scan a government ID in Verify identity. Verified shops get a badge, and buyers trust them more.' },
      { screen: { src: '/tutorial/academy/analytics.webp', caption: 'Analytics: orders and sales' }, title: 'Look at your analytics', text: 'See your best products and busy days. Make more of what sells.' },
    ],
    tips: ['Decorate your shop with a ready-made look. It takes one tap.'],
    action: { label: 'Open marketing', to: '/seller/marketing', seller: true },
  },
  {
    slug: 'stay-safe',
    screen: { src: '/tutorial/academy/support.webp', caption: 'Admin messages' },
    stage: 'grow',
    Icon: ShieldCheck,
    tone: 'violet',
    title: 'Stay safe and get help',
    summary: 'Protect your account and know who can help you.',
    minutes: 2,
    visual: {
      kind: 'cards',
      items: [
        { Icon: Key, title: 'Strong password', text: 'Never share it' },
        { Icon: ShieldCheck, title: 'New password', text: 'Changing it signs out other phones' },
        { Icon: Robot, title: 'Ate Moormy', text: 'Your helper in Chat, any time' },
        { Icon: Headset, title: 'Town admin', text: 'Message the admin of your town' },
      ],
    },
    steps: [
      { screen: { src: '/tutorial/academy/profile-settings.webp', caption: 'Password, in Account Settings' }, title: 'Protect your account', text: 'Use a strong password only you know. To change it, open Account Settings and tap Password. Other phones are then signed out.' },
      { title: 'Watch for scams', text: 'Nobody from E-MOORM asks for your password, PIN or OTP. Do not click strange links.' },
      { title: 'Follow the rules', text: 'Sell real things you have. No fake or banned items. Be honest with buyers.' },
      { screen: { src: '/tutorial/academy/assistant.webp', caption: 'Ate Moormy, your seller helper' }, title: 'Ask Ate Moormy', text: 'Your seller helper answers "how do I…" questions. Open Chat and tap Ask Ate Moormy (the sparkle on phones).' },
      { screen: { src: '/tutorial/academy/support.webp', caption: 'Admin messages: New support case' }, title: 'Message your town admin', text: 'For problems with an order, a buyer or your shop, open Admin in your Seller Center.' },
    ],
    tips: ['If a buyer is rude or unsafe, report it. Your town admin will look at it.'],
    action: { label: 'Message the admin', to: '/seller/support', seller: true },
  },
];

/** Lesson number (1-based) by slug. */
export const lessonNumber = (slug) => LESSONS.findIndex((l) => l.slug === slug) + 1;

export const totalMinutes = LESSONS.reduce((sum, l) => sum + l.minutes, 0);

// Finished lessons, kept on this device only (a convenience, not a record).
const DONE_KEY = 'emoorm-academy-done';

export function readDone() {
  try {
    const list = JSON.parse(localStorage.getItem(DONE_KEY) || '[]');
    return Array.isArray(list) ? list.filter((s) => LESSONS.some((l) => l.slug === s)) : [];
  } catch {
    return [];
  }
}

export function writeDone(list) {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify(list));
  } catch {
    // Private windows and blocked storage: progress just is not kept.
  }
}

