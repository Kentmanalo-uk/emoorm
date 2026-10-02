import { useLocation } from 'react-router-dom';
import MoreMenu from '../MoreMenu';
import { pageMenuItems } from '../../lib/pageMenus';
import useAuthStore from '../../store/authStore';

/**
 * Phones: the ⋯ button at the right end of a page header, with links to the
 * pages that go with this one (lib/pageMenus.jsx). `extra` items (this
 * page's own actions) come first.
 */
export default function PageMenu({ area = 'buyer', extra = [], className = '' }) {
  const { pathname } = useLocation();
  const role = useAuthStore((s) => s.user?.role);
  const signedIn = useAuthStore((s) => s.isAuthenticated);
  const items = [
    ...extra.filter(Boolean),
    ...pageMenuItems(pathname, { area, isSuperAdmin: role === 'SUPER_ADMIN', signedIn }),
  ];
  if (!items.length) return null;
  return (
    <MoreMenu
      items={items}
      label="Page menu"
      className={`page-menu ${className}`.trim()}
      buttonClassName="page-menu-btn"
      iconSize={22}
    />
  );
}
