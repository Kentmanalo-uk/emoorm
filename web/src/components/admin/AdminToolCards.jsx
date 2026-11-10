import { Link } from 'react-router-dom';
import { CaretRight } from '../../lib/icons';
import {
  BellArt, BubbleArt, ChartArt, ChatArt, ClockArt, EnvelopeArt, FlagArt, GearArt, GiftArt, GridArt,
  HeadsetArt, IdCardArt, MapArt, SparkArt, PackageArt, PeopleArt, PictureArt, QrArt, ReceiptArt, ReturnArt,
  ShieldArt, ShopArt, StarArt, TONES, TownArt, TruckArt,
} from '../art/FlatArt';
import useShortcutLook, { useShortcutScale } from '../../hooks/useShortcutLook';
import { useAdminShell } from './adminShell';

/*
 * The admin's tools as the seller app's tool grid: the shortcut marks
 * (FlatArt), in the look and size the super admin chose for them (glass or
 * 3D), a small pink count when something is waiting. The Tools tab shows
 * every card; Home shows the quick ones. `tone` only where two tools would
 * otherwise share a mark's colour side by side.
 */

const TOOL = {
  applications: { to: '/admin/sellers', label: 'Applications', Art: IdCardArt, tone: TONES.orange },
  sellers: { to: '/admin/all-sellers', label: 'Sellers', Art: ShopArt },
  buyers: { to: '/admin/buyers', label: 'Buyers', Art: PeopleArt },
  products: { to: '/admin/products', label: 'Products', Art: PackageArt },
  orders: { to: '/admin/orders', label: 'Orders', Art: ReceiptArt },
  reviews: { to: '/admin/reviews', label: 'Reviews', Art: StarArt },
  returns: { to: '/admin/returns', label: 'Returns', Art: ReturnArt, tone: TONES.rose },
  reports: { to: '/admin/reports', label: 'Reports', Art: FlagArt },
  flags: { to: '/admin/flags', label: 'Unusual activity', Art: ShieldArt, tone: TONES.amber },
  support: { to: '/admin/support', label: 'Support', Art: HeadsetArt },
  messages: { to: '/admin/messages', label: 'Messages', Art: ChatArt, badge: 'messages' },
  email: { to: '/admin/email', label: 'Email', Art: EnvelopeArt },
  alerts: { to: '/admin/notifications', label: 'Notifications', Art: BellArt, badge: 'notifications' },
  feedback: { to: '/admin/feedback', label: 'Feedback', Art: BubbleArt, badge: 'feedback', superOnly: true },
  analytics: { to: '/admin/analytics', label: 'Analytics', Art: ChartArt },
  auditLogs: { to: '/admin/audit-logs', label: 'Audit log', Art: ClockArt, tone: TONES.teal },
  users: { to: '/admin/users', label: 'All users', Art: PeopleArt, tone: TONES.blue, superOnly: true },
  categories: { to: '/admin/categories', label: 'Categories', Art: GridArt, superOnly: true },
  municipalities: { to: '/admin/municipalities', label: 'Municipalities', Art: TownArt, superOnly: true },
  admins: { to: '/admin/junior-admins', label: 'Town admins', Art: ShieldArt, superOnly: true },
  banners: { to: '/admin/banners', label: 'Banners', Art: PictureArt, superOnly: true },
  vouchers: { to: '/admin/vouchers', label: 'Vouchers', Art: GiftArt, superOnly: true },
  couriers: { to: '/admin/couriers', label: 'Couriers', Art: TruckArt, superOnly: true },
  appUsers: { to: '/admin/app-users', label: 'App users', Art: QrArt, tone: TONES.green, superOnly: true },
  ml: { to: '/admin/ml', label: 'ML engine', Art: SparkArt, superOnly: true },
  team: { to: '/admin/team', label: 'Admin team', Art: PeopleArt, tone: TONES.blue, municipalOnly: true },
  // Settings: the town's page for a municipal admin; the platform's for the super admin.
  settings: { to: '/admin/settings', label: 'Settings', Art: GearArt },
  townPage: { to: '/admin/settings?tab=municipality', label: 'Town page', Art: MapArt, municipalOnly: true },
};

/** Every card on the Tools tab. */
const ALL_CARDS = [
  { title: 'To review', keys: ['applications', 'products', 'returns', 'reports', 'flags', 'support'] },
  { title: 'People & stores', keys: ['sellers', 'buyers', 'users', 'orders', 'reviews'] },
  { title: 'Messages', keys: ['messages', 'email', 'alerts', 'feedback'] },
  { title: 'Storefront', keys: ['banners', 'vouchers', 'couriers', 'categories'] },
  // The super admin's platform; a municipal admin's town office.
  { title: 'Platform', keys: ['municipalities', 'admins', 'appUsers', 'analytics', 'ml', 'auditLogs', 'settings'], superOnly: true },
  { title: 'Town office', keys: ['team', 'townPage', 'analytics', 'auditLogs', 'settings'], municipalOnly: true },
];

/** Home: the ones an admin opens most, per role. */
const QUICK = {
  MUNICIPAL: ['applications', 'products', 'orders', 'reports', 'support', 'sellers', 'returns', 'analytics'],
  SUPER: ['applications', 'products', 'orders', 'reports', 'support', 'sellers', 'municipalities', 'analytics'],
};

function useToolCount() {
  const { waiting = {}, unreadCount = 0, messageUnread = 0, feedbackNew = 0 } = useAdminShell();
  return (tool) => {
    if (tool.badge === 'messages') return messageUnread;
    if (tool.badge === 'notifications') return unreadCount;
    if (tool.badge === 'feedback') return feedbackNew;
    return Number(waiting?.[tool.to]?.count || 0);
  };
}

function ToolGrid({ tools }) {
  const countOf = useToolCount();
  const look = useShortcutLook();
  const scale = useShortcutScale();
  return (
    <div className="sh-tools" style={{ '--sc-scale': scale }}>
      {tools.map((tool) => {
        const {
          to, label, Art, tone,
        } = tool;
        const waitingCount = countOf(tool);
        return (
          <Link key={to} to={to} className="sh-tool" aria-label={waitingCount > 0 ? `${label}, ${waitingCount} waiting` : label}>
            <span className="sh-tool-icon">
              <Art size={36} tone={tone} glass look={look} />
              {waitingCount > 0 && <b className="ah-tool-badge">{waitingCount > 99 ? '99+' : waitingCount}</b>}
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
    </div>
  );
}

/** Home's card: the quick tools, and the way to all of them. */
export function QuickToolsCard() {
  const { isSuperAdmin } = useAdminShell();
  const tools = (isSuperAdmin ? QUICK.SUPER : QUICK.MUNICIPAL).map((key) => TOOL[key]);
  return (
    <section className="sh-card">
      <div className="sh-card-head">
        <h2>Quick tools</h2>
        <Link to="/admin/tools">All tools <CaretRight size={13} weight="bold" /></Link>
      </div>
      <ToolGrid tools={tools} />
    </section>
  );
}

/** The Tools tab: every card the admin's role can use. */
export function AllToolCards() {
  const { isSuperAdmin } = useAdminShell();
  const cards = ALL_CARDS
    .filter((card) => (isSuperAdmin ? !card.municipalOnly : !card.superOnly))
    .map((card) => ({ ...card, tools: card.keys.map((key) => TOOL[key]).filter((t) => (isSuperAdmin ? !t.municipalOnly : !t.superOnly)) }))
    .filter((card) => card.tools.length > 0);
  return (
    <>
      {cards.map((card) => (
        <section key={card.title} className="sh-card">
          <div className="sh-card-head"><h2>{card.title}</h2></div>
          <ToolGrid tools={card.tools} />
        </section>
      ))}
    </>
  );
}
