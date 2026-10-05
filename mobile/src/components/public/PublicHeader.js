import { usePathname } from 'expo-router';
import {
  BuildingsIcon, FileTextIcon, ImagesIcon, InfoIcon, QuestionIcon, ShieldCheckIcon, ShoppingBagIcon, StorefrontIcon,
} from 'phosphor-react-native';
import ScreenHeader from '../ScreenHeader';
import ShellPageMenu from '../ShellPageMenu';

/*
 * The ⋯ menu of the public pages (web/src/lib/pageMenus.jsx, buyer rules for
 * /about, /privacy, /terms, /cookies, /municipality/:id[/gallery] and /u/:id),
 * on the app's paths. Other paths (the 404 page) keep the shared fallback.
 */
const item = (key, Icon, label, to) => ({ key, Icon, label, to });

const P = {
  about: item('about', InfoIcon, 'About Emoorm', '/about'),
  privacy: item('privacy', ShieldCheckIcon, 'Privacy Policy', '/privacy'),
  terms: item('terms', FileTextIcon, 'Terms of Service', '/terms'),
  cookies: item('cookies', FileTextIcon, 'Cookie Policy', '/cookies'),
  help: item('help', QuestionIcon, 'Help Center', '/help-center'),
  stores: item('stores', StorefrontIcon, 'Browse stores', '/stores'),
  products: item('products', ShoppingBagIcon, 'Browse products', '/products'),
};

const RULES = [
  [/^\/(about|privacy|terms|cookies)$/, [P.about, P.privacy, P.terms, P.cookies, P.help]],
  [/^\/municipality\/([^/]+)\/gallery/, (m) => [
    item('town', BuildingsIcon, 'Town page', `/municipality/${m[1]}`),
    item('town-products', ShoppingBagIcon, 'Products from here', `/products?municipalityId=${m[1]}`),
  ]],
  [/^\/municipality\/([^/]+)/, (m) => [
    item('town-products', ShoppingBagIcon, 'Products from here', `/products?municipalityId=${m[1]}`),
    item('gallery', ImagesIcon, 'Photo gallery', `/municipality/${m[1]}/gallery`),
    P.stores,
  ]],
  [/^\/u\//, [P.stores, P.products]],
];

/** The public page's menu links, or null to use the shared menu. */
export function publicMenuItems(pathname) {
  const path = (pathname || '').replace(/\/$/, '') || '/';
  for (const [re, list] of RULES) {
    const m = path.match(re);
    if (m) {
      const items = typeof list === 'function' ? list(m) : list;
      return items.filter((it) => it.to !== path);
    }
  }
  return null;
}

/**
 * The back bar of a public page: ScreenHeader with the website's ⋯ links
 * for that page. title: the page's first heading, as the website moves it up.
 */
export default function PublicHeader({ title, backTo }) {
  const pathname = usePathname();
  const items = publicMenuItems(pathname);
  if (!items) return <ScreenHeader title={title} backTo={backTo} />;
  return <ScreenHeader title={title} backTo={backTo} menu={false} action={<ShellPageMenu items={items} />} />;
}
