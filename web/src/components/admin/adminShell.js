import { createContext, useContext } from 'react';

/**
 * What the admin shell (AdminLayout) already knows, for the pages inside it:
 * the waiting counts, unread counts, the admin's role and municipality, and
 * a way to ask to sign out. Admin pages wrap themselves in AdminLayout rather
 * than sitting under an <Outlet />, so this context is how the phone Home and
 * Me pages read them without fetching again.
 */
export const AdminShellContext = createContext(null);

/** The shell's values, or an empty object outside AdminLayout. */
export const useAdminShell = () => useContext(AdminShellContext) || {};
