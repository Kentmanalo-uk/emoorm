import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Profile from './pages/Profile';
import Products from './pages/Products';
import ProductDetails from './pages/ProductDetails';
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
import SellerReviews from './pages/SellerReviews';
import SellerAnalytics from './pages/SellerAnalytics';
import SellerFinance from './pages/SellerFinance';
import SellerFulfillment from './pages/SellerFulfillment';
import SellerSettings from './pages/SellerSettings';
import Stores from './pages/Stores';
import StoreDetail from './pages/StoreDetail';
import Wishlist from './pages/Wishlist';
import Notifications from './pages/Notifications';
import AdminDashboard from './pages/AdminDashboard';
import AdminSellers from './pages/AdminSellers';
import AdminProducts from './pages/AdminProducts';
import AdminReports from './pages/AdminReports';
import AdminUsers from './pages/AdminUsers';
import AdminCategories from './pages/AdminCategories';
import AdminMunicipalities from './pages/AdminMunicipalities';
import AdminAnalytics from './pages/AdminAnalytics';
import AdminAnnouncements from './pages/AdminAnnouncements';
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
import CustomerCare from './pages/CustomerCare';
import Feedback from './pages/Feedback';
import { WishlistContent } from './pages/Wishlist';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import RoleGate from './components/RoleGate';
import ScrollToTop from './components/ScrollToTop';
import AppToaster from './components/ui/AppToaster';
import './App.css';
import './styles/responsive.css';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <ScrollToTop />
        <AppToaster />
        <RoleGate>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/products" element={<Products />} />
            <Route path="/search" element={<Products />} />
            <Route path="/product/:slug" element={<ProductDetails />} />
            <Route path="/stores" element={<Stores />} />
            <Route path="/store/:slug" element={<StoreDetail />} />
            <Route path="/sell" element={<Sell />} />
            <Route path="/search/image" element={<SearchByImage />} />
            <Route path="/about" element={<About />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/cookies" element={<CookiePolicy />} />
            <Route path="/customer-care" element={<CustomerCare />} />
            <Route path="/feedback" element={<Feedback />} />

            {/* Protected routes — require login */}
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
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
            </Route>
            <Route path="/help" element={<HelpCenter />} />
            <Route path="/cart" element={<ProtectedRoute><Cart /></ProtectedRoute>} />
            <Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
            <Route path="/orders/:id/receipt" element={<ProtectedRoute><OrderReceipt /></ProtectedRoute>} />
            <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />

            {/* Seller onboarding */}
            <Route path="/seller/apply" element={<SellerApply />} />

            {/* Seller Center — SELLER role only (guarded inside SellerLayout) */}
            <Route path="/seller" element={<SellerLayout />}>
              <Route index element={<SellerDashboard />} />
              <Route path="orders" element={<SellerOrders />} />
              <Route path="returns" element={<SellerReturns />} />
              <Route path="messages" element={<SellerMessages />} />
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
            <Route path="/admin/products" element={<AdminRoute><AdminProducts /></AdminRoute>} />
            <Route path="/admin/reports" element={<AdminRoute><AdminReports /></AdminRoute>} />
            <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
            <Route path="/admin/categories" element={<AdminRoute><AdminCategories /></AdminRoute>} />
            <Route path="/admin/municipalities" element={<AdminRoute><AdminMunicipalities /></AdminRoute>} />
            <Route path="/admin/analytics" element={<AdminRoute><AdminAnalytics /></AdminRoute>} />
            <Route path="/admin/announcements" element={<AdminRoute><AdminAnnouncements /></AdminRoute>} />
            <Route path="/admin/banners" element={<AdminRoute><AdminBanners /></AdminRoute>} />
            <Route path="/admin/vouchers" element={<AdminRoute><AdminVouchers /></AdminRoute>} />
            <Route path="/admin/junior-admins" element={<AdminRoute><AdminJuniorAdmins /></AdminRoute>} />
            <Route path="/admin/audit-logs" element={<AdminRoute><AdminAuditLogs /></AdminRoute>} />
            <Route path="/admin/settings" element={<AdminRoute><AdminSettings /></AdminRoute>} />

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </RoleGate>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
