import { Link, useLocation } from 'react-router-dom';
import { Plus } from '@phosphor-icons/react';
import { pageMenuItems } from '../../lib/pageMenus';

/*
 * Computers: the slim strip under the top bar of the admin panel and the
 * Seller Center.
 *
 * Left, the pages that go with the one open (the same list the phone keeps
 * behind its ⋯ button; on a wide screen there is room to show it). Right,
 * the things made most often from here, each a plain link to the page that
 * does it, so nothing here can be out of step with those pages.
 */
const CREATE = {
  SUPER_ADMIN: [
    { key: 'announce', label: 'Announcement', to: '/admin/messages?tab=announcements' },
    { key: 'banner', label: 'Banner', to: '/admin/banners' },
    { key: 'voucher', label: 'Voucher', to: '/admin/vouchers' },
    { key: 'category', label: 'Category', to: '/admin/categories' },
  ],
  MUNICIPAL_ADMIN: [
    { key: 'announce', label: 'Announcement', to: '/admin/messages?tab=announcements' },
    { key: 'team', label: 'Team member', to: '/admin/team' },
  ],
  SELLER: [
    { key: 'product', label: 'Product', to: '/seller/products/new' },
    { key: 'package', label: 'Package', to: '/seller/products/new?type=package' },
    { key: 'today', label: "Today's item", to: '/seller/today' },
    { key: 'announce', label: 'Announcement', to: '/seller/marketing' },
  ],
};

// Pages that only make sense on a phone (its tool grid and Me tab), and the
// public help centre: the sidebar and the top bar cover those here.
const NOT_HERE = /^\/(admin\/(tools|menu)|seller\/menu|help)(\/|$|\?)/;

export default function ToolStrip({ area, role }) {
  const { pathname } = useLocation();
  const path = pathname.replace(/\/$/, '') || '/';
  const create = (CREATE[role] || []).filter((c) => c.to.split('?')[0] !== path);
  // A page that is also a create link shows once, on the right.
  const creates = new Set(create.map((c) => c.to));
  const related = pageMenuItems(pathname, { area, isSuperAdmin: role === 'SUPER_ADMIN', signedIn: true })
    .filter((it) => !NOT_HERE.test(it.to) && !creates.has(it.to));
  if (!related.length && !create.length) return null;

  return (
    <div className="ac-toolstrip" aria-label="Related pages and shortcuts">
      <nav className="ac-toolstrip-related" aria-label="Related pages">
        {related.map((it) => (
          <Link key={it.key} to={it.to} className="ac-toolstrip-chip">
            {it.icon}
            <span>{it.label}</span>
          </Link>
        ))}
      </nav>
      {create.length > 0 && (
        <div className="ac-toolstrip-create">
          {create.map(({ key, label, to }) => (
            <Link key={key} to={to} className="ac-toolstrip-btn">
              <Plus size={13} weight="bold" />
              <span>{label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
