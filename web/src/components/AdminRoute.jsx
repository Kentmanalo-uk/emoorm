import React from 'react';
import { Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

const ADMIN_ROLES = ['MUNICIPAL_ADMIN', 'SUPER_ADMIN'];

export default function AdminRoute({ children }) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) return <Navigate to="/login?redirect=/admin" replace />;
  if (!ADMIN_ROLES.includes(user?.role)) return <Navigate to="/" replace />;

  return children;
}
