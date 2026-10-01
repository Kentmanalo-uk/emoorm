import React from 'react';
import { Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

const ADMIN_ROLES = ['MUNICIPAL_ADMIN', 'SUPER_ADMIN'];

export default function AdminRoute({ children, roles = ADMIN_ROLES }) {
  const { isAuthenticated, user, signOutTo } = useAuthStore();

  // Just signed out here: where the sign-out sent them (phones: the visitor Profile).
  if (!isAuthenticated) return <Navigate to={signOutTo || '/login?redirect=/admin'} replace />;
  if (!roles.includes(user?.role)) return <Navigate to="/admin" replace />;

  return children;
}
