import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { usePhoneLayout } from '../hooks/useMobileNav';
import LoginGate from './LoginGate';

// roles: optional array of allowed roles e.g. ['SELLER', 'SUPER_ADMIN']
// gate: optional page key ('cart' | 'messages' | 'notifications' | 'profile').
//   On phones a signed-out visitor sees a "log in to see this" page for it
//   instead of being bounced to the login form. Wider screens keep the redirect.
const ProtectedRoute = ({ children, roles, gate }) => {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();
  const isPhone = usePhoneLayout();

  if (!isAuthenticated) {
    if (gate && isPhone) return <LoginGate page={gate} />;
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && roles.length > 0 && !roles.includes(user?.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
