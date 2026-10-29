import { Link } from 'react-router-dom';
import {
  IdentificationBadge, Storefront, Users, Package, Receipt, Star, ArrowCounterClockwise, Flag,
  ChatsCircle, EnvelopeSimple, Bell, ChatCircleDots, ChartPie, UsersThree, SquaresFour,
  MapPin, UserGear, Image as ImageIcon, Ticket, CaretRight, Truck, DeviceMobile, PaperPlaneTilt,
  ClockCounterClockwise, Gear,
} from '@phosphor-icons/react';
import ToolGradients from '../ui/ToolGradients';
import { useAdminShell } from './adminShell';

/*
 * The admin's tools as the seller app's tool grid: filled icons in gradient
 * colours, a small pink count when something is waiting. The Tools tab shows
 * every card; Home shows the quick ones.
 */

const TOOL = {
  applications: { to: '/admin/sellers', label: 'Applications', Icon: IdentificationBadge, tone: 'orange' },
  sellers: { to: '/admin/all-sellers', label: 'Sellers', Icon: Storefront, tone: 'blue' },
  buyers: { to: '/admin/buyers', label: 'Buyers', Icon: Users, tone: 'violet' },
  products: { to: '/admin/products', label: 'Products', Icon: Package, tone: 'green' },
  orders: { to: '/admin/orders', label: 'Orders', Icon: Receipt, tone: 'amber' },
  reviews: { to: '/admin/reviews', label: 'Reviews', Icon: Star, tone: 'rose' },
  returns: { to: '/admin/returns', label: 'Returns', Icon: ArrowCounterClockwise, tone: 'pink' },
  reports: { to: '/admin/reports', label: 'Reports', Icon: Flag, tone: 'teal' },
  support: { to: '/admin/support', label: 'Support', Icon: ChatsCircle, tone: 'green' },
  messages: { to: '/admin/messages', label: 'Messages', Icon: EnvelopeSimple, tone: 'blue', badge: 'messages' },
  email: { to: '/admin/email', label: 'Email', Icon: PaperPlaneTilt, tone: 'teal' },
  alerts: { to: '/admin/notifications', label: 'Notifications', Icon: Bell, tone: 'amber', badge: 'notifications' },
  feedback: { to: '/admin/feedback', label: 'Feedback', Icon: ChatCircleDots, tone: 'pink', badge: 'feedback', superOnly: true },
  analytics: { to: '/admin/analytics', label: 'Analytics', Icon: ChartPie, tone: 'teal' },
  auditLogs: { to: '/admin/audit-logs', label: 'Audit log', Icon: ClockCounterClockwise, tone: 'violet' },
  users: { to: '/admin/users', label: 'All users', Icon: UsersThree, tone: 'violet', superOnly: true },
  categories: { to: '/admin/categories', label: 'Categories', Icon: SquaresFour, tone: 'orange', superOnly: true },
  municipalities: { to: '/admin/municipalities', label: 'Municipalities', Icon: MapPin, tone: 'teal', superOnly: true },
  admins: { to: '/admin/junior-admins', label: 'Town admins', Icon: UserGear, tone: 'blue', superOnly: true },
  banners: { to: '/admin/banners', label: 'Banners', Icon: ImageIcon, tone: 'pink', superOnly: true },
  vouchers: { to: '/admin/vouchers', label: 'Vouchers', Icon: Ticket, tone: 'rose', superOnly: true },
  couriers: { to: '/admin/couriers', label: 'Couriers', Icon: Truck, tone: 'amber', superOnly: true },
  appUsers: { to: '/admin/app-users', label: 'App users', Icon: DeviceMobile, tone: 'green', superOnly: true },
  team: { to: '/admin/team', label: 'Admin team', Icon: UsersThree, tone: 'blue', municipalOnly: true },
  // Settings: the town's page for a municipal admin; the platform's for the super admin.
  settings: { to: '/admin/settings', label: 'Settings', Icon: Gear, tone: 'violet' },
  townPage: { to: '/admin/settings?tab=municipality', label: 'Town page', Icon: MapPin, tone: 'teal', municipalOnly: true },
};

/** Every card on the Tools tab. */
const ALL_CARDS = [
  { title: 'To review', keys: ['applications', 'products', 'returns', 'reports', 'support'] },
  { title: 'People & stores', keys: ['sellers', 'buyers', 'users', 'orders', 'reviews'] },
  { title: 'Messages', keys: ['messages', 'email', 'alerts', 'feedback'] },
  { title: 'Storefront', keys: ['banners', 'vouchers', 'couriers', 'categories'] },
  // The super admin's platform; a municipal admin's town office.
  { title: 'Platform', keys: ['municipalities', 'admins', 'appUsers', 'analytics', 'auditLogs', 'settings'], superOnly: true },
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
  return (
    <div className="sh-tools">
      {tools.map((tool) => {
        const { to, label, Icon, tone } = tool;
        const waitingCount = countOf(tool);
        return (
          <Link key={to} to={to} className="sh-tool" aria-label={waitingCount > 0 ? `${label}, ${waitingCount} waiting` : label}>
            <span className={`sh-tool-icon is-${tone}`}>
              <Icon size={30} weight="fill" />
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
      <ToolGradients />
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
      <ToolGradients />
      {cards.map((card) => (
        <section key={card.title} className="sh-card">
          <div className="sh-card-head"><h2>{card.title}</h2></div>
          <ToolGrid tools={card.tools} />
        </section>
      ))}
    </>
  );
}
