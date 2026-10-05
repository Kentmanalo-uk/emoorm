import { Fragment, useEffect, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import apiClient from '../../api/client';
import { resolveImg } from '../../lib/media';
import { appPath } from '../../lib/notificationLink';
import { border, font, surface, t, text } from '../../theme';

/*
 * The website's footer (web/src/components/layout/Footer.jsx + Footer.css),
 * which on phones shows on the homepage only: the town seals and the app
 * mark, the link columns, contact details, the "about" text with its
 * directory of categories, places and guides, and the copyright line.
 */

const SUPPORT_EMAIL = 'support@emoorm.shop';
const FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=61593727164885';
const SITE_URL = 'https://emoorm.shop';
const BRAND_ICON = require('../../../assets/brand-icon.png');

const PAYMENT_OPTIONS = ['Cash on Delivery', 'GCash', 'QR Ph'];
const LANGUAGE_NAMES = ['English', 'Tagalog', 'Bisaya'];

const BUYER_GUIDES = [
  { to: '/help?topic=buying', label: 'How to Buy' },
  { to: '/help?topic=payments', label: 'Payment Methods' },
  { to: '/help?topic=delivery', label: 'Shipping & Delivery' },
  { to: '/help?topic=returns', label: 'Returns & Refunds' },
  { to: '/profile/verification', label: 'Verify Your Identity' },
  { to: '/search/image', label: 'Search by Image' },
];

const SELLER_TOOLS = [
  { to: '/sell', label: 'Sell on Emoorm' },
  { to: '/seller/apply', label: 'Seller Application' },
  { to: '/seller', label: 'Seller Center' },
  { to: '/seller/fulfillment', label: 'Delivery & Pickup Settings' },
  { to: '/seller/analytics', label: 'Sales Analytics' },
  { to: '/seller/finance', label: 'Finance' },
];

const COMPANY_LINKS = [
  { to: '/about', label: 'About Emoorm' },
  { to: '/help', label: 'Help & Support' },
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/terms', label: 'Terms of Service' },
  { to: '/cookies', label: 'Cookie Policy' },
];

const CUSTOMER_CARE = [
  { to: '/help', label: 'Help & Support' },
  { to: '/help?topic=buying', label: 'How to Buy' },
  { to: '/sell', label: 'How to Sell' },
  { to: '/help?topic=returns', label: 'Returns & Refunds' },
  { to: '/help?topic=delivery', label: 'Shipping & Delivery' },
  { to: '/help?topic=payments', label: 'Payment Methods' },
];

const EMOORM_LINKS = [
  { to: '/about', label: 'About Emoorm' },
  { to: '/about#how-it-works', label: 'How Emoorm Works' },
  { to: '/seller/apply', label: 'Seller Registration' },
  { to: '/app', label: 'Get the App' },
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/terms', label: 'Terms of Service' },
];

const ACCOUNT_LINKS = [
  { to: '/login', label: 'Sign In' },
  { to: '/register', label: 'Create Account' },
  { to: '/profile', label: 'My Profile' },
  { to: '/wishlist', label: 'My Wishlist' },
  { to: '/notifications', label: 'Notifications' },
  { to: '/profile/orders', label: 'My Orders' },
];

const MUNICIPALITY_NAMES = 'Baco, Bansud, Bongabong, Bulalacao, Calapan City, Gloria, Mansalay, Naujan, Pinamalayan, Pola, Puerto Galera, Roxas, San Teodoro, Socorro, Victoria';

const ABOUT = [
  [null, 'Emoorm is an online marketplace that connects buyers with farmers, fishers, artisans, and food producers across Oriental Mindoro. Instead of travelling between towns or waiting for market day, you can browse fresh produce, dried goods, beverages, local delicacies, and handcrafted products from sellers across the province, all in one place. Anyone can create a buyer account and browse for free.'],
  ['Shop Local, Direct from the Source', 'Every store on Emoorm is run by a local seller who manages their own listings, stock, orders, and fulfillment from the Seller Center. When you order, you deal directly with the seller, so your purchase supports the people who grow, catch, and make the products.'],
  ['Reviewed Sellers and Approved Listings', 'Residents who want to sell submit a seller application that is reviewed by a municipal or platform administrator before their store goes live. New product listings are also checked before they appear to buyers, and administrators can suspend stores or listings that break the rules. If something looks wrong, you can report a product or seller from its page.'],
  ['Payment Arranged with the Seller', 'Emoorm does not process or hold payments. Depending on what each seller accepts, you can pay by Cash on Delivery, GCash or QR Ph. For GCash and QR Ph, you pay once the seller confirms your order (My Orders, To Pay) and the seller checks your payment before preparing it.'],
  ['Delivery or Store Pickup', 'Sellers choose whether they deliver, offer pickup, or both, and set the municipalities and barangays they deliver to. At checkout you pick the option that suits you, and you are notified as your order is confirmed, prepared, and ready for pickup or on its way.'],
  ['Safer Checkout with Identity Verification', 'To protect sellers from fake orders, buyers verify their identity once before checking out by scanning a valid Philippine government ID, such as a PhilSys National ID, driver’s license, UMID, or passport. The ID photo is only used to read your name and is not stored. If automatic verification does not work, your municipal admin can help.'],
  ['Returns, Refunds, and Reviews', 'If an item arrives damaged, incorrect, incomplete, or not as described, you can request a return from your order within 7 days, unless the seller’s return policy says otherwise. After your order is completed, you can rate the product and leave a review to help other buyers.'],
  ['Talk Directly with Sellers and Support', 'Message a store to ask about a product, stock, or delivery before you buy, and keep the conversation going after you order. For account or verification concerns, the support chat connects you with the administrator of your municipality.'],
  ['Made for Mindoreños', 'Browse Emoorm in English, Tagalog, or Bisaya, sign in with your email or Google account, find sellers near you on the store map, and search for products using a photo. Sellers can switch between their personal and seller accounts at any time.'],
];

// The footer's website paths on the app's routes.
const footerHref = (to) => {
  const path = to.split('#')[0];
  if (path === '/search/image') return '/search-by-image';
  if (path === '/sell') return '/seller-apply';
  return appPath(path);
};

function useOpen() {
  const router = useRouter();
  return (to) => {
    if (/^(https?:|mailto:)/.test(to)) {
      Linking.openURL(to).catch(() => {});
      return;
    }
    // The app's download page lives on the website.
    if (to === '/app') {
      Linking.openURL(`${SITE_URL}/app`).catch(() => {});
      return;
    }
    const href = footerHref(to);
    if (href) router.push(href);
  };
}

/** A column of links (.footer-section). */
function FooterSection({ title, links, open }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
      <View style={styles.links}>
        {links.map((link) => (
          <Pressable key={link.key || link.to} accessibilityRole="link" onPress={() => open(link.to)} style={styles.linkHit}>
            <Text style={styles.link}>{link.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Comma-separated inline link list (.footer-directory-links). */
function LinkList({ items, open }) {
  return (
    <Text style={[styles.dirText, styles.dirLinks]}>
      {items.map((item, index) => (
        <Fragment key={item.key || item.to}>
          {index > 0 ? ', ' : ''}
          {/* Each link stays on one line, as the website's inline-block links. */}
          <Text accessibilityRole="link" onPress={() => open(item.to)}>{item.label.replace(/ /g, ' ')}</Text>
        </Fragment>
      ))}
    </Text>
  );
}

function DirectoryGroup({ title, children }) {
  return (
    <View style={styles.dirGroup}>
      <Text style={styles.smallHeading}>{title}</Text>
      {children}
    </View>
  );
}

function Badges({ items }) {
  return (
    <View style={styles.badges}>
      {items.map((label) => (
        <View key={label} style={styles.badge}><Text style={styles.badgeText}>{label}</Text></View>
      ))}
    </View>
  );
}

/** A town seal: its logo, or its first letter. */
function Seal({ municipality }) {
  return (
    <View style={styles.seal} accessibilityLabel={municipality.name}>
      {municipality.logo ? (
        <Image source={{ uri: resolveImg(municipality.logo) }} style={styles.sealImage} resizeMode="contain" />
      ) : (
        <Text style={styles.sealLetter}>{municipality.name?.charAt(0).toUpperCase()}</Text>
      )}
    </View>
  );
}

export default function HomeFooter({ municipalities = [], categories = [], appLogo = null }) {
  const open = useOpen();
  const [stores, setStores] = useState([]);
  const [logoFailed, setLogoFailed] = useState(false);
  const year = new Date().getFullYear();

  useEffect(() => {
    let live = true;
    apiClient.get('/stores', { params: { page: 1, pageSize: 12 } })
      .then((res) => { if (live) setStores(res.data || []); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const allCategories = categories.filter((c) => c.isActive !== false);
  const logoUri = appLogo && appLogo !== '/brand-icon.png' && !logoFailed ? resolveImg(appLogo) : null;
  const logo = logoUri ? { uri: logoUri } : BRAND_ICON;

  return (
    <View style={styles.footer}>
      {/* Brand band: the app mark, then the town seals (7 on top, the rest below). */}
      <View style={styles.brandBand}>
        <View style={styles.brand}>
          <Image source={logo} style={styles.brandLogo} resizeMode="contain" onError={() => setLogoFailed(true)} accessibilityElementsHidden />
          <Text style={styles.brandName}>Emoorm</Text>
        </View>
        {municipalities.length > 0 ? (
          <View style={styles.seals} accessibilityLabel="Municipalities of Oriental Mindoro">
            {[municipalities.slice(0, 7), municipalities.slice(7)].map((row, index) => (
              row.length > 0 ? (
                <View key={index} style={styles.sealRow}>
                  {row.map((m) => <Seal key={m.id} municipality={m} />)}
                </View>
              ) : null
            ))}
          </View>
        ) : (
          <Text style={styles.townsText}>
            Calapan City • Puerto Galera • Naujan • Pinamalayan • Bansud • Bongabong • Bulalacao • Gloria • Mansalay • Pola • Roxas • San Teodoro • Socorro • Victoria
          </Text>
        )}
      </View>

      {/* Link columns, two across; Contact Us spans both. */}
      <View style={styles.content}>
        <View style={styles.contentRow}>
          <FooterSection title="Customer Care" links={CUSTOMER_CARE} open={open} />
          <FooterSection title="Emoorm" links={EMOORM_LINKS} open={open} />
        </View>
        <View style={styles.contentRow}>
          <FooterSection title="My Account" links={ACCOUNT_LINKS} open={open} />
          <FooterSection
            title="Shop by Category"
            open={open}
            links={allCategories.length > 0
              ? allCategories.slice(0, 8).map((c) => ({ key: c.id, to: `/products?category=${c.id}`, label: c.name }))
              : [{ to: '/products', label: 'Browse All Products' }]}
          />
        </View>

        <View style={styles.contact}>
          <Text style={styles.sectionTitle} accessibilityRole="header">Contact Us</Text>
          <View style={styles.contactList}>
            <View style={styles.contactItem}>
              <Text style={styles.contactLabel}>ADDRESS:</Text>
              <Text style={styles.contactValue}>Oriental Mindoro, Philippines</Text>
            </View>
            <View style={styles.contactItem}>
              <Text style={styles.contactLabel}>EMAIL:</Text>
              <Text style={[styles.contactValue, styles.contactLink]} accessibilityRole="link" onPress={() => open(`mailto:${SUPPORT_EMAIL}`)}>{SUPPORT_EMAIL}</Text>
            </View>
            <View style={styles.contactItem}>
              <Text style={styles.contactLabel}>FACEBOOK:</Text>
              <Text style={[styles.contactValue, styles.contactLink]} accessibilityRole="link" onPress={() => open(FACEBOOK_URL)}>Emoorm on Facebook</Text>
            </View>
            <View style={styles.contactItem}>
              <Text style={styles.contactLabel}>HOURS:</Text>
              <Text style={styles.contactValue}>Mon-Sat, 8AM - 6PM PHT</Text>
            </View>
          </View>

          <Text style={styles.subtitle}>Payment Methods</Text>
          <Badges items={PAYMENT_OPTIONS} />
          <Text style={styles.subtitle}>Fulfillment</Text>
          <Badges items={['Home Delivery', 'Store Pickup']} />
        </View>
      </View>

      {/* About Emoorm, then categories, places and guides. */}
      <View style={styles.directory}>
        <View>
          <Text style={styles.aboutTitle} accessibilityRole="header">Oriental Mindoro&apos;s Local Online Marketplace</Text>
          {ABOUT.map(([heading, body], i) => (
            <Fragment key={i}>
              {heading ? <Text style={styles.smallHeading}>{heading.toUpperCase()}</Text> : null}
              <Text style={[styles.dirText, styles.aboutText]}>{body}</Text>
            </Fragment>
          ))}
        </View>

        <View style={styles.groups}>
          <Text style={styles.aboutTitle} accessibilityRole="header">Shop, Places, and Guides</Text>
          {allCategories.length > 0 ? (
            <DirectoryGroup title="SHOP BY CATEGORY">
              <LinkList open={open} items={allCategories.map((c) => ({ key: c.id, to: `/products?category=${c.id}`, label: c.name }))} />
            </DirectoryGroup>
          ) : null}
          <DirectoryGroup title="MUNICIPALITIES">
            {municipalities.length > 0 ? (
              <LinkList open={open} items={municipalities.map((m) => ({ key: m.id, to: `/municipality/${m.id}`, label: m.name }))} />
            ) : (
              <Text style={styles.dirText}>{MUNICIPALITY_NAMES}</Text>
            )}
          </DirectoryGroup>
          {stores.length > 0 ? (
            <DirectoryGroup title="LOCAL STORES">
              <LinkList
                open={open}
                items={[
                  ...stores.map((store) => ({ key: store.id, to: `/store/${store.slug}`, label: store.name })),
                  { key: 'all-stores', to: '/stores', label: 'View all stores' },
                ]}
              />
            </DirectoryGroup>
          ) : null}
          <DirectoryGroup title="BUYER GUIDES"><LinkList open={open} items={BUYER_GUIDES} /></DirectoryGroup>
          <DirectoryGroup title="SELLER TOOLS"><LinkList open={open} items={SELLER_TOOLS} /></DirectoryGroup>
          <DirectoryGroup title="PAYMENT OPTIONS"><Text style={styles.dirText}>{PAYMENT_OPTIONS.join(', ')}</Text></DirectoryGroup>
          <DirectoryGroup title="FULFILLMENT"><Text style={styles.dirText}>Home Delivery, Store Pickup</Text></DirectoryGroup>
          <DirectoryGroup title="LANGUAGES"><Text style={styles.dirText}>{LANGUAGE_NAMES.join(', ')}</Text></DirectoryGroup>
          <DirectoryGroup title="COMPANY"><LinkList open={open} items={COMPANY_LINKS} /></DirectoryGroup>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Brand line on top, legal links centred below. */}
      <View style={styles.copyright}>
        <View style={styles.copyrightBrand}>
          <Image source={logo} style={styles.copyrightLogo} resizeMode="contain" accessibilityElementsHidden />
          <Text style={styles.copyrightText}>{`© ${year} Emoorm. All rights reserved.`}</Text>
        </View>
        <View style={styles.legal}>
          {[['/about', 'About'], ['/privacy', 'Privacy Policy'], ['/terms', 'Terms of Service'], ['/cookies', 'Cookie Policy']].map(([to, label]) => (
            <Pressable key={to} accessibilityRole="link" onPress={() => open(to)} style={styles.legalLink}>
              <Text style={styles.copyrightText}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 32px under the page, 28px in; the bottom clears what the website's
  // fixed bottom nav covers (92px less the 74px tab bar).
  footer: {
    marginTop: 32, paddingTop: 28, paddingHorizontal: 12, paddingBottom: 18,
    borderTopWidth: 1, borderTopColor: border.default, backgroundColor: surface.page,
  },

  brandBand: {
    alignItems: 'center', gap: 16, paddingBottom: 20, marginBottom: 20,
    borderBottomWidth: 1, borderBottomColor: border.default,
  },
  brand: { alignItems: 'center', gap: 6 },
  brandLogo: { width: 52, height: 52 },
  brandName: { fontSize: 18, lineHeight: 28.8, letterSpacing: 0.36, ...font(700), color: text.strong },
  seals: { alignItems: 'center', gap: 12, alignSelf: 'stretch' },
  sealRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  seal: {
    width: 42, height: 42, borderRadius: 21, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    backgroundColor: t.neutral[0],
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 1, color: border.default }],
  },
  sealImage: { width: '100%', height: '100%' },
  sealLetter: { fontSize: 16, lineHeight: 20, ...font(700), color: t.primary[600] },
  townsText: { fontSize: 13, lineHeight: 19.5, ...font(400), color: text.muted, textAlign: 'center' },

  content: { gap: 20, marginBottom: 24 },
  contentRow: { flexDirection: 'row', gap: 12 },
  section: { flex: 1, minWidth: 0, gap: 8 },
  sectionTitle: { fontSize: 14, lineHeight: 16.1, ...font(500), color: text.strong },
  links: { gap: 2, alignItems: 'flex-start' },
  linkHit: { paddingVertical: 5 },
  link: { fontSize: 13, lineHeight: 19.5, ...font(400), color: text.muted },

  contact: { gap: 8 },
  contactList: { gap: 10 },
  contactItem: { gap: 2 },
  contactLabel: { fontSize: 11, lineHeight: 17.6, letterSpacing: 0.55, ...font(600), color: text.strong },
  contactValue: { fontSize: 13, lineHeight: 20.8, ...font(400), color: text.muted },
  contactLink: { color: text.link, alignSelf: 'flex-start' },
  subtitle: { marginTop: 16, fontSize: 13, lineHeight: 14.95, ...font(600), color: text.strong },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: {
    paddingVertical: 5, paddingHorizontal: 9, borderWidth: 1, borderColor: border.strong, borderRadius: 999,
    backgroundColor: t.neutral[0],
  },
  badgeText: { fontSize: 11, lineHeight: 17.6, ...font(500), color: t.secondary[950] },

  directory: { gap: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: border.default },
  aboutTitle: { marginBottom: 12, fontSize: 16, lineHeight: 21.6, ...font(500), color: text.strong },
  smallHeading: { marginBottom: 6, fontSize: 11.5, lineHeight: 13.225, letterSpacing: 0.23, ...font(500), color: text.strong },
  dirText: { fontSize: 12.5, lineHeight: 19.375, ...font(400), color: text.muted },
  aboutText: { marginBottom: 12 },
  // Links are padded 2px above and below, so a line of them is 4px taller.
  dirLinks: { lineHeight: 23.375 },
  groups: {},
  dirGroup: { marginBottom: 14 },

  divider: { marginTop: 24, height: 1, backgroundColor: border.default },
  copyright: { marginTop: 16, alignItems: 'center', gap: 8 },
  copyrightBrand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  copyrightLogo: { width: 22, height: 22 },
  copyrightText: { fontSize: 13, lineHeight: 20.8, ...font(400), color: text.muted, textAlign: 'center' },
  legal: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 18, rowGap: 4 },
  legalLink: { minHeight: 32, justifyContent: 'center' },
});
