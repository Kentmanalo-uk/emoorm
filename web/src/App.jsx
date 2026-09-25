import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Profile from './pages/Profile';
import Products from './pages/Products';
import ProductDetails from './pages/ProductDetails';
import ProductReviews from './pages/ProductReviews';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import OrderReceipt from './pages/OrderReceipt';
import Orders from './pages/Orders';
import Messages from './pages/Messages';
import Addresses from './pages/Addresses';
import Sell from './pages/Sell';
import SellerApply from './pages/SellerApply';
import SellerLayout from './components/layout/SellerLayout';
import SellerDashboard from './pages/SellerDashboard';
import SellerStore from './pages/SellerStore';
import SellerProducts from './pages/SellerProducts';
import SellerOrders from './pages/SellerOrders';
import SellerMessages from './pages/SellerMessages';
import SellerSupport from './pages/SellerSupport';
import SellerReviews from './pages/SellerReviews';
import SellerAnalytics from './pages/SellerAnalytics';
import SellerFinance from './pages/SellerFinance';
import SellerFulfillment from './pages/SellerFulfillment';
import SellerSettings from './pages/SellerSettings';
import Stores from './pages/Stores';
import StoreDetail from './pages/StoreDetail';
import PublicProfile from './pages/PublicProfile';
import MunicipalityShowcase from './pages/MunicipalityShowcase';
import MunicipalityGallery from './pages/MunicipalityGallery';
import Wishlist from './pages/Wishlist';
import Notifications from './pages/Notifications';
import NotificationDetail from './pages/NotificationDetail';
import AdminDashboard from './pages/AdminDashboard';
import AdminSellers from './pages/AdminSellers';
import AdminProducts from './pages/AdminProducts';
import AdminReports from './pages/AdminReports';
import AdminUsers from './pages/AdminUsers';
import AdminOrders from './pages/AdminOrders';
import AdminCategories from './pages/AdminCategories';
import AdminMunicipalities from './pages/AdminMunicipalities';
import AdminAnalytics from './pages/AdminAnalytics';
import AdminMessages from './pages/AdminMessages';
import AdminFeedback from './pages/AdminFeedback';
import AdminBanners from './pages/AdminBanners';
import AdminVouchers from './pages/AdminVouchers';
import AdminJuniorAdmins from './pages/AdminJuniorAdmins';
import AdminAuditLogs from './pages/AdminAuditLogs';
import AdminSettings from './pages/AdminSettings';
import ProfileLayout from './components/layout/ProfileLayout';
import ProfileReviews from './pages/ProfileReviews';
import ProfileFollowedStores from './pages/ProfileFollowedStores';
import ProfileMessages from './pages/ProfileMessages';
import ProfileSettings from './pages/ProfileSettings';
import ProfileVerification from './pages/ProfileVerification';
import ProfileSupport from './pages/ProfileSupport';
import ProfileReports from './pages/ProfileReports';
import AdminSupport from './pages/AdminSupport';
import AdminNotifications from './pages/AdminNotifications';
import AdminReviews from './pages/AdminReviews';
import AdminReturns from './pages/AdminReturns';
import NotFound from './pages/NotFound';
import HelpCenter from './pages/HelpCenter';
import About from './pages/About';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import CookiePolicy from './pages/CookiePolicy';
import SearchByImage from './pages/SearchByImage';
import Returns from './pages/Returns';
import ReturnRequest from './pages/ReturnRequest';
import ReturnDetail from './pages/ReturnDetail';
import SellerReturns from './pages/SellerReturns';
import { WishlistContent } from './pages/Wishlist';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import RoleGate from './components/RoleGate';
import ScrollToTop from './components/ScrollToTop';
import AppToaster from './components/ui/AppToaster';
import AccountSwitchOverlay from './components/account/AccountSwitchOverlay';
import useAuthStore from './store/authStore';
import { ThemeRuntime } from './hooks/useTheme';
import { usePhoneLayout } from './hooks/useMobileNav';
import { isAuthSheetPath, HOME_BACKGROUND } from './lib/authSheet';
import './App.css';
import './styles/responsive.css';
import './styles/accent.css';

/**
 * Shared query client.
 *
 * Defaults are deliberately conservative — a per-resource staleTime from
 * lib/queryKeys.js overrides them where a longer or shorter window is right.
 * Two requests for the same key made at the same time are de-duplicated into
 * one network call, which is where most of the saved traffic comes from.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // Come back online → refresh, so a reconnect does not leave stale data.
      refetchOnReconnect: true,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 15 * 60 * 1000,
    },
  },
});

// Signing in or out must drop every cached response: without this, the next
// account could be shown the previous one's data from memory. Nothing is
// persisted to disk, so no cached response survives a reload either.
useAuthStore.subscribe((state, previousState) => {
  if ((state.user?.id ?? null) !== (previousState.user?.id ?? null)) {
    queryClient.clear();
  }
});

/**
 * Every route. On phones, /login and /register open as a sheet over the page
 * the shopper was on: the routes keep rendering that page underneath (or
 * Home, when the login link was opened directly) and the form slides up on
 * top. Tablet and desktop show them as pages, as before.
 */
function AppRoutes() {
  const location = useLocation();
  const isPhone = usePhoneLayout();
  const onAuth = isAuthSheetPath(location.pathname);
  // The last page that was not the sheet: what the sheet opens over.
  const [underneath, setUnderneath] = useState(onAuth ? null : location);
  if (!onAuth && underneath?.key !== location.key) setUnderneath(location);
  const background = isPhone && onAuth ? (underneath || HOME_BACKGROUND) : null;

  return (
    <>
      <Routes location={background || location}>
        {/* Public routes */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/products" element={<Products />} />
        <Route path="/search" element={<Products />} />
        <Route path="/product/:slug" element={<ProductDetails />} />
        <Route path="/product/:slug/reviews" element={<ProductReviews />} />
        <Route path="/stores" element={<Stores />} />
        <Route path="/store/:slug" element={<StoreDetail />} />
        <Route path="/u/:id" element={<PublicProfile />} />
        <Route path="/municipality/:id" element={<MunicipalityShowcase />} />
        <Route path="/municipality/:id/gallery" element={<MunicipalityGallery />} />
        <Route path="/sell" element={<Sell />} />
        <Route path="/search/image" element={<SearchByImage />} />
        <Route path="/about" element={<About />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/cookies" element={<CookiePolicy />} />
        {/* Customer Care and Feedback folded into Help & Support. Both
            paths are still linked from the wild, so they redirect. */}
        <Route path="/customer-care" element={<Navigate to="/help" replace />} />
        <Route path="/feedback" element={<Navigate to="/help" replace />} />

        {/* Protected routes — require login */}
        <Route
          path="/profile"
          element={
            <ProtectedRoute gate="profile">
              <ProfileLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Profile />} />
          <Route path="orders" element={<Orders />} />
          <Route path="returns" element={<Returns />} />
          <Route path="returns/request" element={<ReturnRequest />} />
          <Route path="returns/:id" element={<ReturnDetail />} />
          <Route path="addresses" element={<Addresses />} />
          <Route path="reviews" element={<ProfileReviews />} />
          <Route path="wishlist" element={<WishlistContent hideBreadcrumbs />} />
          <Route path="followed-stores" element={<ProfileFollowedStores />} />
          <Route path="messages" element={<ProfileMessages />} />
          <Route path="notifications" element={<Notifications bare />} />
          <Route path="settings" element={<ProfileSettings />} />
          <Route path="verification" element={<ProfileVerification />} />
          <Route path="support" element={<ProfileSupport />} />
          <Route path="reports" element={<ProfileReports />} />
        </Route>
        <Route path="/help" element={<HelpCenter />} />
        <Route path="/cart" element={<ProtectedRoute gate="cart"><Cart /></ProtectedRoute>} />
        <Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
        <Route path="/orders/:id/receipt" element={<ProtectedRoute><OrderReceipt /></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute gate="messages"><Messages /></ProtectedRoute>} />
        <Route path="/wishlist" element={<Wishlist />} />
        <Route path="/notifications" element={<ProtectedRoute gate="notifications"><Notifications /></ProtectedRoute>} />
        <Route path="/notifications/:id" element={<ProtectedRoute><NotificationDetail /></ProtectedRoute>} />

        {/* Seller onboarding */}
        <Route path="/seller/apply" element={<SellerApply />} />

        {/* Seller Center — SELLER role only (guarded inside SellerLayout) */}
        <Route path="/seller" element={<SellerLayout />}>
          <Route index element={<SellerDashboard />} />
          <Route path="orders" element={<SellerOrders />} />
          <Route path="returns" element={<SellerReturns />} />
          <Route path="messages" element={<SellerMessages />} />
          <Route path="support" element={<SellerSupport />} />
          <Route path="notifications" element={<Notifications mode="SELLER" bare shell="seller" />} />
          <Route path="products" element={<SellerProducts />} />
          <Route path="products/new" element={<SellerProducts />} />
          <Route path="reviews" element={<SellerReviews />} />
          <Route path="analytics" element={<SellerAnalytics />} />
          <Route path="finance" element={<SellerFinance />} />
          <Route path="store" element={<SellerStore />} />
          <Route path="fulfillment" element={<SellerFulfillment />} />
          <Route path="settings" element={<SellerSettings />} />
        </Route>
        {/* Admin — MUNICIPAL_ADMIN / SUPER_ADMIN only */}
        <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/admin/sellers" element={<AdminRoute><AdminSellers /></AdminRoute>} />
        <Route path="/admin/all-sellers" element={<AdminRoute><AdminUsers fixedRole="SELLER" title="All Sellers" /></AdminRoute>} />
        <Route path="/admin/buyers" element={<AdminRoute><AdminUsers fixedRole="BUYER" title="Buyer Management" /></AdminRoute>} />
        <Route path="/admin/products" element={<AdminRoute><AdminProducts /></AdminRoute>} />
        <Route path="/admin/orders" element={<AdminRoute><AdminOrders /></AdminRoute>} />
        <Route path="/admin/reports" element={<AdminRoute><AdminReports /></AdminRoute>} />
        <Route path="/admin/support" element={<AdminRoute><AdminSupport /></AdminRoute>} />
        <Route path="/admin/users" element={<AdminRoute roles={['SUPER_ADMIN']}><AdminUsers /></AdminRoute>} />
        <Route path="/admin/categories" element={<AdminRoute roles={['SUPER_ADMIN']}><AdminCategories /></AdminRoute>} />
        <Route path="/admin/municipalities" element={<AdminRoute roles={['SUPER_ADMIN']}><AdminMunicipalities /></AdminRoute>} />
        <Route path="/admin/analytics" element={<AdminRoute><AdminAnalytics /></AdminRoute>} />
        {/* Announcements are a tab of Messages now; the old path is still
            linked from bookmarks and older notifications. */}
        <Route path="/admin/messages" element={<AdminRoute><AdminMessages /></AdminRoute>} />
        <Route path="/admin/feedback" element={<AdminRoute roles={['SUPER_ADMIN']}><AdminFeedback /></AdminRoute>} />
        <Route path="/admin/announcements" element={<Navigate to="/admin/messages?tab=announcements" replace />} />
        <Route path="/admin/banners" element={<AdminRoute roles={['SUPER_ADMIN']}><AdminBanners /></AdminRoute>} />
        <Route path="/admin/vouchers" element={<AdminRoute roles={['SUPER_ADMIN']}><AdminVouchers /></AdminRoute>} />
        <Route path="/admin/junior-admins" element={<AdminRoute roles={['SUPER_ADMIN']}><AdminJuniorAdmins /></AdminRoute>} />
        <Route path="/admin/audit-logs" element={<AdminRoute><AdminAuditLogs /></AdminRoute>} />
        <Route path="/admin/notifications" element={<AdminRoute><AdminNotifications /></AdminRoute>} />
        <Route path="/admin/notifications/:id" element={<AdminRoute><NotificationDetail admin /></AdminRoute>} />
        <Route path="/admin/reviews" element={<AdminRoute><AdminReviews /></AdminRoute>} />
        <Route path="/admin/returns" element={<AdminRoute><AdminReturns /></AdminRoute>} />
        <Route path="/admin/settings" element={<AdminRoute><AdminSettings /></AdminRoute>} />

        {/* Catch-all: unknown URLs */}
        <Route path="*" element={<NotFound />} />
      </Routes>
      {background && (
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
      )}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Applies the saved palette and renders nothing. Inside the query
          provider because the theme arrives with the app settings. */}
      <ThemeRuntime />
      <Router>
        <ScrollToTop />
        <AppToaster />
        <AccountSwitchOverlay />
        <RoleGate>
          <AppRoutes />
        </RoleGate>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
