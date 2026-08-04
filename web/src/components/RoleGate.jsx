import React from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

const ADMIN_ROLES = ['MUNICIPAL_ADMIN', 'SUPER_ADMIN'];

/**
 * Top-level gate: admin users are locked to /admin/*.
 * Any attempt to hit a buyer/seller/public URL redirects them home to /admin.
 * Renders children unchanged for everyone else.
 */
export default function RoleGate({ children }) {
  const { isAuthenticated, user } = useAuthStore();
  const { pathname, search, hash } = useLocation();

  const isAdmin = isAuthenticated && ADMIN_ROLES.includes(user?.role);

  if (isAdmin) {
    const url = pathname + search + hash;
    const onAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
    const onLogin = pathname === '/login';
    if (!onAdmin) {
      return <Navigate to="/admin" replace state={{ blockedFrom: url }} />;
    }
    // Already-logged-in admins hitting /login → bounce to /admin
    if (onLogin) {
      return <Navigate to="/admin" replace />;
    }
  }

  return children;
}
