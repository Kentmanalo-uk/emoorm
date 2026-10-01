import { Navigate } from 'react-router-dom';
import AdminLayout from '../components/admin/AdminLayout';
import { AllToolCards } from '../components/admin/AdminToolCards';
import { usePhoneLayout } from '../hooks/useMobileNav';
import './SellerApp.css';

/*
 * Tools (phone tab): every admin section as tool cards (Marketplace,
 * Messages & insights, and System for the super admin), each with what is
 * waiting on it. On a computer the sidebar lists them, so this goes to Home.
 */
export default function AdminTools() {
  const isPhone = usePhoneLayout();
  if (!isPhone) return <Navigate to="/admin" replace />;
  return (
    <AdminLayout>
      <div className="sh ah">
        <div className="sh-body">
          <AllToolCards />
        </div>
      </div>
    </AdminLayout>
  );
}
