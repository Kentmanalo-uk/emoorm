import { Suspense, lazy, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Profile from './pages/Profile';
import Products from './pages/Products';
import SearchStart from './pages/SearchStart';
import ProductDetails from './pages/ProductDetails';
import ProductTransitions from './lib/productTransition';
import ProductReviews from './pages/ProductReviews';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import OrderReceipt from './pages/OrderReceipt';
import Orders from './pages/Orders';
import Messages from './pages/Messages';
import Addresses from './pages/Addresses';
import Stores from './pages/Stores';
import StoreDetail from './pages/StoreDetail';
import PublicProfile from './pages/PublicProfile';
import MunicipalityShowcase from './pages/MunicipalityShowcase';
import Wishlist from './pages/Wishlist';
import Notifications from './pages/Notifications';
import ProfileLayout from './components/layout/ProfileLayout';
import ProfileReviews from './pages/ProfileReviews';
import ProfileFollowedStores from './pages/ProfileFollowedStores';
import ProfileMessages from './pages/ProfileMessages';
import ProfileSettings from './pages/ProfileSettings';
import ProfileVerification from './pages/ProfileVerification';
import ProfileSupport from './pages/ProfileSupport';
import ProfileReports from './pages/ProfileReports';
import ProfileOffers from './pages/ProfileOffers';
import NotFound from './pages/NotFound';
import HelpCenter from './pages/HelpCenter';
import Returns from './pages/Returns';
import ReturnRequest from './pages/ReturnRequest';
import ReturnDetail from './pages/ReturnDetail';
import { WishlistContent } from './pages/Wishlist';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import RoleGate from './components/RoleGate';
import ScrollMemory from './components/ScrollMemory';
import StatusBarTint from './components/StatusBarTint';
import AppToaster from './components/ui/AppToaster';
import NotificationWatcher from './components/NotificationWatcher';
import ActivityBar from './components/ui/ActivityBar';
import AccountSwitchOverlay from './components/account/AccountSwitchOverlay';
import useAuthStore from './store/authStore';
import AppInstallPing from './components/AppInstallPing';
import AppUpdateBar from './components/AppUpdateBar';
import { ThemeRuntime } from './hooks/useTheme';
import { usePhoneLayout } from './hooks/useMobileNav';
import { isAuthSheetPath, HOME_BACKGROUND } from './lib/authSheet';
import './App.css';
import './styles/responsive.css';
import './styles/accent.css';
import Spinner from './components/ui/Spinner';
import { RouteTitles } from './lib/routeTitles';
import ConfirmHost from './components/ui/ConfirmHost';
import OfflineBanner from './components/ui/OfflineBanner';

// Pages most shoppers never open (the Seller Center, the admin panel, legal
// and app pages) load when first visited instead of with every page.
const AppGoogle = lazy(() => import('./pages/AppGoogle'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const Sell = lazy(() => import('./pages/Sell'));
const SellerApply = lazy(() => import('./pages/SellerApply'));
const SellerLayout = lazy(() => import('./components/layout/SellerLayout'));
// Also the admin's notification page, so it brings the admin shell only when opened.
const NotificationDetail = lazy(() => import('./pages/NotificationDetail'));
const SellerDashboard = lazy(() => import('./pages/SellerDashboard'));
const SellerStore = lazy(() => import('./pages/SellerStore'));
const SellerProducts = lazy(() => import('./pages/SellerProducts'));
const SellerOrders = lazy(() => import('./pages/SellerOrders'));
const SellerMessages = lazy(() => import('./pages/SellerMessages'));
const SellerAssistant = lazy(() => import('./pages/SellerAssistant'));
const SellerSupport = lazy(() => import('./pages/SellerSupport'));
const SellerReviews = lazy(() => import('./pages/SellerReviews'));
const SellerQuestions = lazy(() => import('./pages/SellerQuestions'));
const SellerAnalytics = lazy(() => import('./pages/SellerAnalytics'));
const SellerFinance = lazy(() => import('./pages/SellerFinance'));
const SellerVerification = lazy(() => import('./pages/SellerVerification'));
const SellerMenu = lazy(() => import('./pages/SellerMenu'));
const SellerMarketing = lazy(() => import('./pages/SellerMarketing'));
const SellerDecorate = lazy(() => import('./pages/SellerDecorate'));
const SellerTemplates = lazy(() => import('./pages/SellerDecorate').then((m) => ({ default: m.SellerTemplates })));
const SellerTemplatePreview = lazy(() => import('./pages/SellerDecorate').then((m) => ({ default: m.SellerTemplatePreview })));
const SellerShopHome = lazy(() => import('./pages/SellerShopHome'));
const SellerFulfillment = lazy(() => import('./pages/SellerFulfillment'));
const SellerSettings = lazy(() => import('./pages/SellerSettings'));
const SellerToday = lazy(() => import('./pages/SellerToday'));
const SellerWelcome = lazy(() => import('./pages/SellerWelcome'));
const MunicipalityGallery = lazy(() => import('./pages/MunicipalityGallery'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminSellers = lazy(() => import('./pages/AdminSellers'));
const AdminProducts = lazy(() => import('./pages/AdminProducts'));
const AdminReports = lazy(() => import('./pages/AdminReports'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const AdminOrders = lazy(() => import('./pages/AdminOrders'));
const AdminCategories = lazy(() => import('./pages/AdminCategories'));
const AdminMunicipalities = lazy(() => import('./pages/AdminMunicipalities'));
const AdminAnalytics = lazy(() => import('./pages/AdminAnalytics'));
const AdminMessages = lazy(() => import('./pages/AdminMessages'));
const AdminFeedback = lazy(() => import('./pages/AdminFeedback'));
const AdminBanners = lazy(() => import('./pages/AdminBanners'));
const AdminCouriers = lazy(() => import('./pages/AdminCouriers'));
const AdminVouchers = lazy(() => import('./pages/AdminVouchers'));
const AdminJuniorAdmins = lazy(() => import('./pages/AdminJuniorAdmins'));
const AdminAuditLogs = lazy(() => import('./pages/AdminAuditLogs'));
const AdminSettings = lazy(() => import('./pages/AdminSettings'));
const AdminMenu = lazy(() => import('./pages/AdminMenu'));
const AdminTools = lazy(() => import('./pages/AdminTools'));
const AdminSupport = lazy(() => import('./pages/AdminSupport'));
const AdminNotifications = lazy(() => import('./pages/AdminNotifications'));
const AdminReviews = lazy(() => import('./pages/AdminReviews'));
const AdminReturns = lazy(() => import('./pages/AdminReturns'));
const About = lazy(() => import('./pages/About'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const CookiePolicy = lazy(() => import('./pages/CookiePolicy'));
const AppDownload = lazy(() => import('./pages/AppDownload'));
const SellerTutorial = lazy(() => import('./pages/SellerTutorial'));
const AdminAppUsers = lazy(() => import('./pages/AdminAppUsers'));
const AdminTeam = lazy(() => import('./pages/AdminTeam'));
const SellerOffers = lazy(() => import('./pages/SellerOffers'));
const SearchByImage = lazy(() => import('./pages/SearchByImage'));
const AvailableToday = lazy(() => import('./pages/AvailableToday'));
const SellerReturns = lazy(() => import('./pages/SellerReturns'));

/** Shown for the moment a page loaded on demand is on its way. */
function RouteLoading() {
  return (
    <div className="route-loading" role="status" aria-label="Loading">
      <Spinner size={22} />
    </div>
  );
}

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
// Phones: /search with nothing asked yet opens the search page (history,
// popular products, categories); with a search or filter it shows the results.
const RESULT_PARAMS = ['q', 'category', 'municipalityId', 'minPrice', 'maxPrice', 'imageSearch'];
function SearchRoute() {
  const isPhone = usePhoneLayout();
  const [params] = useSearchParams();
  const asked = RESULT_PARAMS.some((key) => params.get(key));
  return isPhone && !asked ? <SearchStart /> : <Products />;
}

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
      <ProductTransitions />
      <RouteTitles />
      <ConfirmHost />
      <OfflineBanner />
      <AppInstallPing />
      <AppUpdateBar />
      <Suspense fallback={<RouteLoading />}>
      <Routes location={background || location}>
        {/* Public routes */}
        <Route path="/" element={<Home />} />
        {/* The Android app's Google sign-in, opened in the phone's browser. */}
        <Route path="/app-google" element={<AppGoogle />} />
        <Route path="/login" element={<Login />} />
        <Route path="/seller/login" element={<Login seller />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/products" element={<Products />} />
        <Route path="/search" element={<SearchRoute />} />
        <Route path="/product/:slug" element={<ProductDetails />} />
        <Route path="/product/:slug/reviews" element={<ProductReviews />} />
        <Route path="/stores" element={<Stores />} />
        <Route path="/today" element={<AvailableToday />} />
        <Route path="/store/:slug" element={<StoreDetail />} />
        <Route path="/u/:id" element={<PublicProfile />} />
        <Route path="/municipality/:id" element={<MunicipalityShowcase />} />
        <Route path="/municipality/:id/gallery" element={<MunicipalityGallery />} />
        <Route path="/sell" element={<Sell />} />
        <Route path="/sell/tutorial" element={<SellerTutorial />} />
        <Route path="/search/image" element={<SearchByImage />} />
        <Route path="/about" element={<About />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/cookies" element={<CookiePolicy />} />
        {/* The Android app's download page */}
        <Route path="/app" element={<AppDownload />} />
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
          <Route path="settings/:part" element={<ProfileSettings />} />
          <Route path="verification" element={<ProfileVerification />} />
          <Route path="support" element={<ProfileSupport />} />
          <Route path="reports" element={<ProfileReports />} />
          <Route path="offers" element={<ProfileOffers />} />
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
        {/* Guided setup right after applying (full screen, every step skippable). */}
        <Route path="/seller/welcome" element={<SellerWelcome />} />

        {/* Seller Center — SELLER role only (guarded inside SellerLayout) */}
        <Route path="/seller" element={<SellerLayout />}>
          <Route index element={<SellerDashboard />} />
          {/* Shop setup was removed; old links land on Home. */}
          <Route path="setup" element={<Navigate to="/seller" replace />} />
          <Route path="verification" element={<SellerVerification />} />
          <Route path="menu" element={<SellerMenu />} />
          <Route path="marketing" element={<SellerMarketing />} />
          <Route path="decorate" element={<SellerDecorate />} />
          <Route path="decorate/home" element={<SellerShopHome />} />
          <Route path="decorate/templates" element={<SellerTemplates />} />
          <Route path="decorate/templates/:key" element={<SellerTemplatePreview />} />
          <Route path="orders" element={<SellerOrders />} />
          <Route path="returns" element={<SellerReturns />} />
          <Route path="messages" element={<SellerMessages />} />
          <Route path="assistant" element={<SellerAssistant />} />
          <Route path="support" element={<SellerSupport />} />
          <Route path="notifications" element={<Notifications mode="SELLER" bare shell="seller" />} />
          <Route path="products" element={<SellerProducts />} />
          <Route path="products/new" element={<SellerProducts />} />
          <Route path="today" element={<SellerToday />} />
          <Route path="reviews" element={<SellerReviews />} />
          <Route path="questions" element={<SellerQuestions />} />
          <Route path="offers" element={<SellerOffers />} />
          <Route path="analytics" element={<SellerAnalytics />} />
          <Route path="finance" element={<SellerFinance />} />
          <Route path="store" element={<SellerStore />} />
          <Route path="store/:part" element={<SellerStore />} />
          <Route path="fulfillment" element={<SellerFulfillment />} />
          <Route path="fulfillment/:part" element={<SellerFulfillment />} />
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
        <Route path="/admin/couriers" element={<AdminRoute roles={['SUPER_ADMIN']}><AdminCouriers /></AdminRoute>} />
        <Route path="/admin/vouchers" element={<AdminRoute roles={['SUPER_ADMIN']}><AdminVouchers /></AdminRoute>} />
        <Route path="/admin/team" element={<AdminRoute roles={['MUNICIPAL_ADMIN']}><AdminTeam /></AdminRoute>} />
        <Route path="/admin/app-users" element={<AdminRoute roles={['SUPER_ADMIN']}><AdminAppUsers /></AdminRoute>} />
        <Route path="/admin/junior-admins" element={<AdminRoute roles={['SUPER_ADMIN']}><AdminJuniorAdmins /></AdminRoute>} />
        <Route path="/admin/audit-logs" element={<AdminRoute><AdminAuditLogs /></AdminRoute>} />
        <Route path="/admin/notifications" element={<AdminRoute><AdminNotifications /></AdminRoute>} />
        <Route path="/admin/notifications/:id" element={<AdminRoute><NotificationDetail admin /></AdminRoute>} />
        <Route path="/admin/reviews" element={<AdminRoute><AdminReviews /></AdminRoute>} />
        <Route path="/admin/returns" element={<AdminRoute><AdminReturns /></AdminRoute>} />
        <Route path="/admin/settings" element={<AdminRoute><AdminSettings /></AdminRoute>} />
        <Route path="/admin/menu" element={<AdminRoute><AdminMenu /></AdminRoute>} />
        <Route path="/admin/tools" element={<AdminRoute><AdminTools /></AdminRoute>} />

        {/* Catch-all: unknown URLs */}
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
      {background && (
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/seller/login" element={<Login seller />} />
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
        <StatusBarTint />
        <AppToaster />
        <NotificationWatcher />
        <ActivityBar />
        <AccountSwitchOverlay />
        <RoleGate>
          <AppRoutes />
        </RoleGate>
        {/* After the pages: it puts a page back where it was scrolled once
            the page has laid itself out (its body classes and all). */}
        <ScrollMemory />
      </Router>
    </QueryClientProvider>
  );
}

export default App;
