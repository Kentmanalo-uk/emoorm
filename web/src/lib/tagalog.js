/**
 * Our own Tagalog for the app's buttons, tabs, headings and labels.
 *
 * With Tagalog chosen, Google's page translation still covers everything
 * (shops' and buyers' own words included), but its wording for the app's UI
 * is stiff or wrong ("Idagdag sa Kariton"). So the app's own short texts are
 * swapped for these first, and marked so Google leaves them alone. A text not
 * in the list falls through to Google as before.
 *
 * Keys are the English exactly as the app shows it (spaces trimmed).
 */
const TL = {
  // Words Filipino shoppers use as they are in apps: kept, so Google does not
  // turn them into "Tahanan" or "Kariton".
  ...Object.fromEntries([
    'Home', 'Cart', 'Profile', 'Chat', 'Wishlist', 'Delivery', 'Pickup', 'Filter', 'Filters',
    'Subtotal', 'Account', 'Inbox', 'Password', 'Email', 'Barangay', 'Stock', 'Seller', 'Voucher',
    'Shopping Cart', 'Cash on Delivery', 'GCash', 'QR Ph', 'Ate Moormy',
  ].map((w) => [w, w])),

  // Moving around
  Messages: 'Mga Mensahe',
  Notifications: 'Mga Abiso',
  Shop: 'Tindahan',
  Stores: 'Mga Tindahan',
  Products: 'Mga Produkto',
  Categories: 'Mga Kategorya',
  About: 'Tungkol',
  Back: 'Bumalik',
  More: 'Iba pa',
  'See all': 'Tingnan lahat',
  'See All': 'Tingnan Lahat',
  'View all': 'Tingnan lahat',
  'View All': 'Tingnan Lahat',
  'See more': 'Tingnan pa',
  'Load more': 'Ipakita pa',
  'Go to homepage': 'Pumunta sa homepage',
  'Go back': 'Bumalik',
  'Try again': 'Subukan ulit',
  'Loading…': 'Naglo-load…',

  // Common actions
  'Clear All': 'Burahin Lahat',
  Apply: 'Ilapat',
  Cancel: 'Kanselahin',
  Delete: 'Burahin',
  Edit: 'I-edit',
  Download: 'I-download',
  Remove: 'Alisin',
  Share: 'Ibahagi',
  Report: 'I-report',
  'Save changes': 'I-save ang mga pagbabago',
  'Discard changes': 'Huwag i-save',
  'Edit profile': 'I-edit ang profile',
  'Edit Profile': 'I-edit ang Profile',
  'Log out': 'Mag-log out',
  'Sign out': 'Mag-log out',
  'Sign In': 'Mag-sign in',
  'Create Account': 'Gumawa ng Account',
  Install: 'I-install',

  // Shops and products
  Follow: 'I-follow',
  Following: 'Sinusundan',
  Message: 'Mag-message',
  'Visit shop': 'Bisitahin ang tindahan',
  'Visit Store': 'Bisitahin ang Tindahan',
  'Add to Cart': 'Idagdag sa Cart',
  'Add to cart': 'Idagdag sa cart',
  'Buy Now': 'Bilhin Ngayon',
  'Buy now': 'Bilhin ngayon',
  Buy: 'Bilhin',
  Ask: 'Magtanong',
  Questions: 'Mga Tanong',
  'No questions yet.': 'Wala pang tanong.',
  Reviews: 'Mga Review',
  'You may also like': 'Baka magustuhan mo rin',
  'From the Same Store': 'Mula sa Parehong Tindahan',
  'Product Description': 'Paglalarawan ng Produkto',
  Specifications: 'Mga Detalye',
  'Delivery Options:': 'Paraan ng Pagpapadala:',
  'Shipping:': 'Pagpapadala:',
  'Return & Warranty:': 'Pagbabalik at Warranty:',
  'Delivery available': 'May delivery',
  'Pickup available': 'Puwedeng i-pickup',
  'Cash on delivery accepted': 'Tumatanggap ng cash on delivery',
  'Cash on delivery available': 'Puwede ang cash on delivery',
  'Delivered by the seller': 'Ihahatid ng seller',
  'No seller return policy provided': 'Walang nakasaad na return policy ang seller',
  Quantity: 'Dami',
  'Quantity:': 'Dami:',
  'Sold by': 'Ibinebenta ng',
  'Local seller': 'Lokal na seller',
  'Local shop': 'Lokal na tindahan',
  'Not taking orders yet': 'Hindi pa tumatanggap ng order',
  "This shop isn't taking orders yet": 'Hindi pa tumatanggap ng order ang tindahang ito',
  'Buy more, pay less:': 'Mas marami, mas mura:',

  // Available Today
  'Available Today': 'Available Today',
  'Available today:': 'Available ngayon:',
  'Ready now': 'Handa na',
  'Made to order': 'Gagawin pagka-order',
  'Pre-order': 'Pre-order',
  'Sold out': 'Ubos na',
  'Ended for now': 'Tapos na sa ngayon',
  'Not available now': 'Wala sa ngayon',
  'Pickup or delivery': 'Pickup o delivery',
  'Pickup only': 'Pickup lang',
  'Delivery only': 'Delivery lang',
  'Ending soon': 'Malapit nang matapos',
  'Ready soonest': 'Pinakamabilis maging handa',
  'Near me': 'Malapit sa akin',
  'Delivers to me': 'Nagde-deliver sa akin',
  'All towns': 'Lahat ng bayan',
  'Nothing available right now': 'Walang available sa ngayon',

  // Search and lists
  Newest: 'Pinakabago',
  Oldest: 'Pinakaluma',
  'Best match': 'Pinakatugma',
  'Top Sales': 'Pinakamabenta',
  Price: 'Presyo',
  'Price: Low to High': 'Presyo: Mababa hanggang Mataas',
  'Price: High to Low': 'Presyo: Mataas hanggang Mababa',
  'Name: A to Z': 'Pangalan: A hanggang Z',
  'Name: Z to A': 'Pangalan: Z hanggang A',
  'All Categories': 'Lahat ng Kategorya',
  'Price Range': 'Hanay ng Presyo',
  Category: 'Kategorya',
  Municipality: 'Munisipyo',
  'Results for': 'Mga resulta para sa',
  'Shop by Category': 'Mamili Ayon sa Kategorya',
  'Suggested for You': 'Para sa Iyo',
  'Stores Near You': 'Mga Tindahang Malapit sa Iyo',
  'Explore Municipals': 'Galugarin ang mga Bayan',
  'Discover Stores': 'Tuklasin ang mga Tindahan',
  'Explore Products': 'Galugarin ang mga Produkto',
  'Recently Viewed': 'Kamakailang Tiningnan',
  'Browse Products': 'Mag-browse ng Produkto',
  'Browse products': 'Mag-browse ng produkto',
  'Browse Stores': 'Mag-browse ng Tindahan',
  'Browse stores': 'Mag-browse ng tindahan',
  'View all stores': 'Tingnan lahat ng tindahan',

  // Cart and checkout
  'Your cart is empty': 'Walang laman ang cart mo',
  'Select all': 'Piliin lahat',
  Checkout: 'Mag-check out',
  'Check out': 'Mag-check out',
  'Place Order': 'Ilagay ang Order',
  'Order summary': 'Buod ng Order',
  'Delivery fee': 'Bayad sa delivery',
  Total: 'Kabuuan',
  'Payment method': 'Paraan ng bayad',
  'Home Delivery': 'Hatid sa Bahay',
  'Store Pickup': 'Kunin sa Tindahan',

  // Orders
  'My Purchase': 'Aking mga Binili',
  'My Orders': 'Aking mga Order',
  'To Pay': 'Babayaran',
  'To Ship': 'Ipapadala',
  'To Receive': 'Matatanggap',
  'To Pick Up': 'Kukunin',
  Completed: 'Natapos',
  Cancelled: 'Kinansela',
  'No orders found': 'Walang order na nakita',
  'Orders & shopping': 'Mga order at pamimili',

  // Account
  'My Wishlist': 'Aking Wishlist',
  'Your wishlist is empty': 'Walang laman ang wishlist mo',
  'Followed Stores': 'Mga Sinusundang Tindahan',
  'Not following any stores yet': 'Wala ka pang sinusundang tindahan',
  'My Addresses': 'Aking mga Address',
  'Add new address': 'Magdagdag ng bagong address',
  'You have no saved addresses yet.': 'Wala ka pang naka-save na address.',
  'Add your first address': 'Idagdag ang una mong address',
  'My Reviews': 'Aking mga Review',
  'My Reports': 'Aking mga Report',
  'Returns & refunds': 'Mga return at refund',
  'Returns & Refunds': 'Mga Return at Refund',
  'Help & Support': 'Tulong at Suporta',
  Settings: 'Mga Setting',
  'Account Settings': 'Setting ng Account',
  'My Profile': 'Aking Profile',
  'Identity Verification': 'Pag-verify ng Pagkakakilanlan',
  'Verify your identity': 'I-verify ang iyong pagkakakilanlan',
  'Verify Your Identity': 'I-verify ang Iyong Pagkakakilanlan',
  'Verify Identity': 'I-verify ang Pagkakakilanlan',
  'Not verified yet': 'Hindi pa verified',
  'Not Verified': 'Hindi pa Verified',
  'Required before you can check out.': 'Kailangan ito bago ka makapag-check out.',
  'Name & photo': 'Pangalan at larawan',
  'Add your number': 'Idagdag ang iyong numero',
  'Home address': 'Address ng bahay',
  'Delivery addresses': 'Mga address para sa delivery',
  'Change your password': 'Palitan ang iyong password',
  'Change Password': 'Palitan ang Password',
  'Current password': 'Kasalukuyang password',
  'New password': 'Bagong password',
  'Confirm new password': 'Kumpirmahin ang bagong password',
  'Update password': 'I-update ang password',
  'Choose a strong, unique password.': 'Pumili ng matibay at natatanging password.',
  'Your data': 'Iyong data',
  'Your Data': 'Iyong Data',
  'Download your data': 'I-download ang iyong data',
  'Delete account': 'Burahin ang account',
  'Member since': 'Miyembro mula',
  'Full name': 'Buong pangalan',
  'Contact number': 'Numero ng telepono',
  'Email cannot be changed.': 'Hindi mapapalitan ang email.',
  'Select barangay': 'Pumili ng barangay',
  'Street / House No.': 'Kalye / Numero ng Bahay',
  'Profile Information': 'Impormasyon ng Profile',
  'Upload photo': 'Mag-upload ng larawan',
  Security: 'Seguridad',
  Services: 'Mga Serbisyo',
  Activity: 'Aktibidad',
  Shopping: 'Pamimili',

  // Messages and notices
  'No notifications yet': 'Wala pang abiso',
  "You're all caught up.": 'Nabasa mo na lahat.',
  'View all notifications': 'Tingnan lahat ng abiso',
  'No conversations yet': 'Wala pang usapan',
  'Your messages': 'Iyong mga mensahe',
  Unread: 'Hindi pa nabasa',
  'Select a conversation to start chatting.': 'Pumili ng usapan para magsimulang mag-chat.',
  'Visit a store and tap Message to start chatting.': 'Bisitahin ang isang tindahan at i-tap ang Mag-message para mag-chat.',

  // Footer and app
  'Sell on Emoorm': 'Magbenta sa Emoorm',
  'Install the E-MOORM app': 'I-install ang E-MOORM app',
  'Shop faster from your home screen': 'Mas mabilis mamili mula sa home screen mo',
  'Customer Care': 'Serbisyo sa Customer',
  'Contact Us': 'Makipag-ugnayan sa Amin',
  'How to Buy': 'Paano Bumili',
  'How to Sell': 'Paano Magbenta',
  'Privacy Policy': 'Patakaran sa Privacy',
  'Terms of Service': 'Mga Tuntunin ng Serbisyo',
};

// Placeholders and screen-reader labels.
const TL_ATTR = {
  Search: 'Maghanap',
  'Search products': 'Maghanap ng produkto',
  'Search products…': 'Maghanap ng produkto…',
  'Search stores': 'Maghanap ng tindahan',
  'Search in cart': 'Maghanap sa cart',
  'Add to cart': 'Idagdag sa cart',
  'Add to wishlist': 'Idagdag sa wishlist',
  'Save to wishlist': 'I-save sa wishlist',
  Back: 'Bumalik',
  'Increase quantity': 'Dagdagan',
  'Decrease quantity': 'Bawasan',
  'More options': 'Iba pang opsyon',
  'Your question': 'Iyong tanong',
};

const ATTRS = ['placeholder', 'aria-label', 'title'];
const SKIP = 'script,style,textarea,input,[contenteditable],.notranslate-user';

const swapText = (node) => {
  const raw = node.nodeValue;
  const key = raw.trim();
  const tl = key && TL[key];
  if (!tl) return;
  // Writing a text, even the same one, is a change the observer sees again.
  if (tl !== key) node.nodeValue = raw.replace(key, tl);
  // The element holding only this text: keep Google off it.
  const el = node.parentElement;
  if (el && el.childNodes.length === 1 && !el.classList.contains('notranslate')) {
    el.setAttribute('translate', 'no');
    el.classList.add('notranslate');
  }
};

const swapAttrs = (el) => {
  for (const name of ATTRS) {
    const v = el.getAttribute?.(name);
    if (v && TL_ATTR[v] && TL_ATTR[v] !== v) el.setAttribute(name, TL_ATTR[v]);
  }
};

const walk = (root) => {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    if (!root.parentElement?.closest(SKIP)) swapText(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE || root.closest?.(SKIP)) return;
  swapAttrs(root);
  root.querySelectorAll?.('[placeholder],[aria-label],[title]').forEach(swapAttrs);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (!n.parentElement?.closest(SKIP)) swapText(n);
  }
};

let started = false;

/** Use our Tagalog for the app's own texts, on this page and as it changes. */
export function startCuratedTagalog() {
  if (started || typeof document === 'undefined') return;
  started = true;
  walk(document.body);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') swapText(r.target);
      else if (r.type === 'attributes') swapAttrs(r.target);
      else r.addedNodes.forEach(walk);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

export const TAGALOG_UI = TL;
