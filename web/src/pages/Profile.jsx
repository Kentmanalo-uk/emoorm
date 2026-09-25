import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  PencilSimple as Edit, Package, Heart, ChatText as MessageSquare, Bell, Storefront as Store,
  ShoppingBag, Clock, Truck, CheckCircle, Gear as Settings, QrCode, CaretRight as ChevronRight, Star,
  ShieldCheck, ShieldWarning, Question,
  Eye, MapPin, ArrowCounterClockwise, Lifebuoy, Flag, SignOut, SealCheck,
} from '@phosphor-icons/react';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';
import { fetchIdentityStatus } from '../lib/identity';
import './Profile.css';
import UserAvatar from '../components/ui/UserAvatar';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import useWishlistStore from '../store/wishlistStore';
import { listMyFollowing } from '../lib/follow';
import { usePhoneLayout } from '../hooks/useMobileNav';

const IDENTITY_META = {
  NOT_VERIFIED: { label: 'Not Verified', tone: 'neutral', Icon: ShieldWarning, hint: 'Required before you can check out.', action: 'Verify Identity' },
  PENDING: { label: 'Verification in Progress', tone: 'pending', Icon: ShieldWarning, hint: 'We are checking your ID.', action: 'View Status' },
  VERIFIED: { label: 'Verified', tone: 'success', Icon: ShieldCheck, hint: 'You can check out and place orders.', action: 'View Details' },
  FAILED: { label: 'Verification Failed', tone: 'error', Icon: ShieldWarning, hint: 'Please retry with a valid ID.', action: 'Retry Verification' },
};

// Phones: one line in the account lists.
function Row({ to, icon: Icon, label, hint }) {
  return (
    <Link to={to} className="pf-m-row">
      <span className="pf-m-row-icon"><Icon size={19} weight="fill" /></span>
      <span className="pf-m-row-label">{label}</span>
      {hint != null && <span className="pf-m-row-hint">{hint}</span>}
      <ChevronRight size={16} className="pf-m-row-chev" />
    </Link>
  );
}

const Profile = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuthStore();
  const isPhone = usePhoneLayout();
  const wishlistCount = useWishlistStore((st) => st.items.length);
  const [reviewCount, setReviewCount] = useState(0);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({
    toPayCount: 0,
    toShipCount: 0,
    toReceiveCount: 0,
    toPickupCount: 0,
  });
  const [followedStores, setFollowedStores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [identityStatus, setIdentityStatus] = useState('NOT_VERIFIED');

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    fetchProfileData();
  }, [isAuthenticated, navigate]);

  const fetchProfileData = async () => {
    setIsLoading(true);
    try {
      // Fetch user profile
      const profileResponse = await axios.get('/auth/profile');
      setProfile(profileResponse.data);

      // Fetch orders
      const ordersResponse = await axios.get('/orders/my/orders');
      setOrders(ordersResponse.data || []);

      // Calculate order stats
      const orderData = ordersResponse.data || [];
      const toPayCount = orderData.filter(o => o.status === 'PENDING').length;
      const toShipCount = orderData.filter(o => o.status === 'CONFIRMED').length;
      const preparingCount = orderData.filter(o => o.status === 'PREPARING').length;
      const readyCount = orderData.filter(o => o.status === 'READY').length;

      setStats({
        toPayCount,
        toShipCount,
        toReceiveCount: preparingCount,
        toPickupCount: readyCount,
      });

      try {
        const identity = await fetchIdentityStatus();
        setIdentityStatus(identity?.status || 'NOT_VERIFIED');
      } catch {
        // non-fatal — the section falls back to "Not Verified"
      }

      // Followed stores and review count; neither blocks the page.
      const [following, reviews] = await Promise.allSettled([
        listMyFollowing(),
        axios.get('/reviews/my/reviews', { params: { page: 1, pageSize: 1 } }),
      ]);
      setFollowedStores(following.status === 'fulfilled' && Array.isArray(following.value) ? following.value : []);
      if (reviews.status === 'fulfilled') {
        setReviewCount(reviews.value?.pagination?.total ?? (reviews.value?.data || []).length);
      }
    } catch (error) {
      console.error('Failed to fetch profile data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getOrderStatusBadge = (status) => {
    const badges = {
      PENDING: { label: 'Pending', color: 'var(--t-warning-500, #f59e0b)', icon: Clock },
      CONFIRMED: { label: 'Confirmed', color: 'var(--t-info-500, #3b82f6)', icon: Package },
      PREPARING: { label: 'Preparing', color: 'var(--t-violet-500, #8b5cf6)', icon: Package },
      READY: { label: 'Ready', color: 'var(--t-orange-500, #f97316)', icon: Store },
      COMPLETED: { label: 'Completed', color: 'var(--t-primary-500, #10b981)', icon: CheckCircle },
      CANCELLED: { label: 'Cancelled', color: 'var(--t-danger-500, #ef4444)', icon: null },
    };
    return badges[status] || { label: status, color: 'var(--t-neutral-500, #6b7280)', icon: null };
  };

  const identityMeta = IDENTITY_META[identityStatus] || IDENTITY_META.NOT_VERIFIED;
  const IdentityIcon = identityMeta.Icon;

  if (isLoading) {
    return (
      <div className="profile-loading">
        <div className="profile-loading-spinner"></div>
        <p>Loading profile...</p>
      </div>
    );
  }

  const name = profile?.fullName || user?.fullName || 'Your account';
  const email = profile?.email || user?.email;
  const purchase = [
    ['To Pay', ShoppingBag, '/profile/orders?status=pending', stats.toPayCount],
    ['To Ship', Package, '/profile/orders?status=processing', stats.toShipCount],
    ['To Receive', Truck, '/profile/orders?status=shipped', stats.toReceiveCount],
    ['To Pick Up', Store, '/profile/orders?status=ready', stats.toPickupCount],
  ];
  if (isPhone) {
    return (
      <div className="pf-m">
        <div className="profile-mobile-page-header">
          <h1>Profile</h1>
          <div className="profile-mobile-header-actions">
            {user?.id && (
              <Link to={`/u/${user.id}`} className="profile-mobile-header-action" aria-label="View public profile">
                <Eye size={19} />
              </Link>
            )}
            <Link to="/profile/settings" className="profile-mobile-header-action" aria-label="Settings">
              <Settings size={19} />
            </Link>
          </div>
        </div>

        {/* Account card: tap to edit. */}
        <section className="pf-m-card">
          <Link to="/profile/settings" className="pf-m-id" aria-label="Edit profile">
            <span className="pf-m-avatar">
              <UserAvatar
                src={profile?.profilePhoto}
                name={name}
                alt=""
                fallbackClassName="profile-avatar-placeholder"
              />
            </span>
            <span className="pf-m-id-text">
              <strong>{name}</strong>
              {email && <span>{email}</span>}
              <em><Edit size={12} weight="bold" /> Edit profile</em>
            </span>
            <ChevronRight size={18} className="pf-m-row-chev" />
          </Link>
          <div className="pf-m-stats">
            <Link to="/profile/followed-stores"><strong>{followedStores.length}</strong><span>Following</span></Link>
            <Link to="/profile/wishlist"><strong>{wishlistCount}</strong><span>Wishlist</span></Link>
            <Link to="/profile/reviews"><strong>{reviewCount}</strong><span>Reviews</span></Link>
          </div>
        </section>

        {/* Identity: one compact row. */}
        <Link to="/profile/verification" className={`pf-m-identity is-${identityMeta.tone}`}>
          <span className="pf-m-identity-icon">
            {identityStatus === 'VERIFIED' ? <SealCheck size={22} weight="fill" /> : <IdentityIcon size={22} weight="fill" />}
          </span>
          <span className="pf-m-identity-text">
            <strong>{identityStatus === 'VERIFIED' ? 'Identity verified' : identityStatus === 'NOT_VERIFIED' ? 'Verify your identity' : identityMeta.label}</strong>
            <span>{identityMeta.hint}</span>
          </span>
          {identityStatus === 'VERIFIED'
            ? <ChevronRight size={16} className="pf-m-row-chev" />
            : <span className="pf-m-identity-cta">{identityStatus === 'NOT_VERIFIED' ? 'Verify' : identityStatus === 'FAILED' ? 'Retry' : 'View'}</span>}
        </Link>

        <section className="pf-m-section">
          <div className="pf-m-section-head">
            <h2>My Purchase</h2>
            <Link to="/profile/orders">See all <ChevronRight size={13} weight="bold" /></Link>
          </div>
          <div className="pf-m-purchase">
            {purchase.map(([label, Icon, to, count]) => (
              <Link key={label} to={to}>
                <span className="pf-m-purchase-icon">
                  <Icon size={24} />
                  {count > 0 && <b>{count > 99 ? '99+' : count}</b>}
                </span>
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="pf-m-section pf-m-list">
          <h2>Orders &amp; shopping</h2>
          <Row to="/profile/orders" icon={Package} label="My Orders" />
          <Row to="/profile/returns" icon={ArrowCounterClockwise} label="Returns & refunds" />
          <Row to="/profile/addresses" icon={MapPin} label="My Addresses" />
          <Row to="/profile/wishlist" icon={Heart} label="Wishlist" hint={wishlistCount || null} />
          <Row to="/profile/followed-stores" icon={Store} label="Followed Stores" hint={followedStores.length || null} />
          <Row to="/profile/reviews" icon={Star} label="My Reviews" hint={reviewCount || null} />
        </section>

        <section className="pf-m-section pf-m-list">
          <h2>Inbox</h2>
          <Row to="/profile/messages" icon={MessageSquare} label="Messages" />
          <Row to="/profile/notifications" icon={Bell} label="Notifications" />
        </section>

        <section className="pf-m-section pf-m-list">
          <h2>More</h2>
          <Row to="/sell" icon={ShoppingBag} label="Sell on Emoorm" />
          <Row to="/profile/support" icon={Lifebuoy} label="Help & Support" />
          <Row to="/profile/reports" icon={Flag} label="My Reports" />
          <Row to="/profile/settings" icon={Settings} label="Settings" />
        </section>

        <button type="button" className="pf-m-signout" onClick={() => setSignOutOpen(true)}>
          <SignOut size={18} weight="bold" /> Log out
        </button>

        <ConfirmDialog
          open={signOutOpen}
          title="Log out?"
          message="You will need to log in again to place orders and see your account."
          confirmLabel="Log out"
          danger
          onConfirm={() => { setSignOutOpen(false); logout(); navigate('/login'); }}
          onCancel={() => setSignOutOpen(false)}
        />
      </div>
    );
  }

  return (
    <>
      <div className="profile-mobile-page-header">
        <h1>Profile</h1>
        <div className="profile-mobile-header-actions">
          <button type="button" className="profile-mobile-header-action" aria-label="QR login">
            <QrCode size={19} />
          </button>
          <Link
            to="/profile/settings"
            className="profile-mobile-header-action"
            aria-label="Profile settings"
          >
            <Settings size={19} />
          </Link>
        </div>
      </div>

      {/* Profile Header */}
      <div className="profile-header-card">
        <div className="profile-header-left">
          <div className="profile-avatar">
            <UserAvatar
              src={profile?.profilePhoto}
              name={profile?.fullName || 'U'}
              alt={profile?.fullName || ''}
              fallbackClassName="profile-avatar-placeholder"
            />
          </div>
          <div className="profile-header-info">
            <h2 className="profile-name">{profile?.fullName || user?.fullName}</h2>
            <p className="profile-email">{profile?.email || user?.email}</p>
            <div className="profile-stats">
              <div className="profile-stat-item">
                <span className="profile-stat-number">{followedStores.length}</span>
                <span className="profile-stat-label">Following</span>
              </div>
              <div className="profile-stat-item">
                <span className="profile-stat-number">{wishlistCount}</span>
                <span className="profile-stat-label">Wishlist</span>
              </div>
              <div className="profile-stat-item">
                <span className="profile-stat-number">{reviewCount}</span>
                <span className="profile-stat-label">Reviews</span>
              </div>
            </div>
          </div>
        </div>
        <div className="profile-header-actions">
          {user?.id && (
            <Link to={`/u/${user.id}`} className="profile-edit-button profile-edit-button--ghost" title="See your profile as sellers and other buyers see it">
              <Eye size={18} />
              View public profile
            </Link>
          )}
          <Link to="/profile/settings" className="profile-edit-button">
            <Edit size={18} />
            Edit Profile
          </Link>
        </div>
      </div>

      {/* Identity Verification Section */}
      <div className="profile-section profile-identity">
        <div className={`profile-identity-icon profile-identity-icon--${identityMeta.tone}`}>
          <IdentityIcon size={26} weight="fill" />
        </div>
        <div className="profile-identity-body">
          <h3 className="profile-section-title">Identity Verification</h3>
          <p className="profile-identity-status">
            <span className={`profile-identity-badge profile-identity-badge--${identityMeta.tone}`}>
              {identityMeta.label}
            </span>
            <span>{identityMeta.hint}</span>
          </p>
        </div>
        <Link to="/profile/verification" className="profile-identity-button">
          {identityMeta.action}
        </Link>
      </div>

      {/* My Purchase Section */}
      <div className="profile-section">
        <div className="profile-section-header">
          <h3 className="profile-section-title">My Purchase</h3>
          <Link to="/profile/orders" className="profile-section-link">
            See All
          </Link>
        </div>
        <div className="purchase-status-grid">
          <Link to="/profile/orders?status=pending" className="purchase-status-item">
            <div className="purchase-status-icon">
              <ShoppingBag size={24} />
              {stats.toPayCount > 0 && (
                <span className="purchase-status-badge">{stats.toPayCount}</span>
              )}
            </div>
            <span className="purchase-status-label">To Pay</span>
          </Link>
          <Link to="/profile/orders?status=processing" className="purchase-status-item">
            <div className="purchase-status-icon">
              <Package size={24} />
              {stats.toShipCount > 0 && (
                <span className="purchase-status-badge">{stats.toShipCount}</span>
              )}
            </div>
            <span className="purchase-status-label">To Ship</span>
          </Link>
          <Link to="/profile/orders?status=shipped" className="purchase-status-item">
            <div className="purchase-status-icon">
              <Truck size={24} />
              {stats.toReceiveCount > 0 && (
                <span className="purchase-status-badge">{stats.toReceiveCount}</span>
              )}
            </div>
            <span className="purchase-status-label">To Receive</span>
          </Link>
          <Link to="/profile/orders?status=ready" className="purchase-status-item">
            <div className="purchase-status-icon">
              <Store size={24} />
              {stats.toPickupCount > 0 && (
                <span className="purchase-status-badge">{stats.toPickupCount}</span>
              )}
            </div>
            <span className="purchase-status-label">To Pick Up</span>
          </Link>
        </div>
      </div>

      {/* Services Section */}
      <div className="profile-section">
        <h3 className="profile-section-title">Services</h3>
        <div className="services-grid">
          <Link to="/profile/notifications" className="service-item">
            <div className="service-icon">
              <Bell size={24} />
            </div>
            <span className="service-label">Notifications</span>
          </Link>
          <Link to="/profile/messages" className="service-item">
            <div className="service-icon">
              <MessageSquare size={24} />
            </div>
            <span className="service-label">Messages</span>
          </Link>
          <Link to="/profile/wishlist" className="service-item">
            <div className="service-icon">
              <Heart size={24} />
            </div>
            <span className="service-label">Wishlist</span>
          </Link>
          <Link to="/profile/settings" className="service-item">
            <div className="service-icon">
              <Settings size={24} />
            </div>
            <span className="service-label">Settings</span>
          </Link>
          <Link to="/sell" className="service-item">
            <div className="service-icon">
              <Store size={24} />
            </div>
            <span className="service-label">Sell on Emoorm</span>
          </Link>
          <Link to="/help" className="service-item">
            <div className="service-icon">
              <Question size={24} />
            </div>
            <span className="service-label">Help &amp; Support</span>
          </Link>
        </div>
      </div>

      <div className="profile-mobile-service-section">
        <h3 className="profile-section-title">Activity</h3>
        <div className="profile-mobile-service-list">
          <Link to="/profile/notifications" className="profile-mobile-service-item">
            <Bell size={20} weight="fill" />
            <span>Notifications</span>
            <ChevronRight size={18} />
          </Link>
          <Link to="/profile/messages" className="profile-mobile-service-item">
            <MessageSquare size={20} weight="fill" />
            <span>Messages</span>
            <ChevronRight size={18} />
          </Link>
          <Link to="/profile/reviews" className="profile-mobile-service-item">
            <Star size={20} weight="fill" />
            <span>Reviews</span>
            <ChevronRight size={18} />
          </Link>
        </div>
      </div>

      <div className="profile-mobile-service-section">
        <h3 className="profile-section-title">Shopping</h3>
        <div className="profile-mobile-service-list">
          <Link to="/profile/wishlist" className="profile-mobile-service-item">
            <Heart size={20} weight="fill" />
            <span>Wishlist</span>
            <ChevronRight size={18} />
          </Link>
          <Link to="/profile/followed-stores" className="profile-mobile-service-item">
            <Store size={20} weight="fill" />
            <span>Followed Stores</span>
            <ChevronRight size={18} />
          </Link>
        </div>
      </div>

      {/* Followed Stores Section */}
      <div className="profile-section">
        <div className="profile-section-header">
          <h3 className="profile-section-title">Followed Stores</h3>
          <Link to="/profile/followed-stores" className="profile-section-link">
            View All
          </Link>
        </div>
        {followedStores.length === 0 ? (
          <div className="empty-state">
            <Store size={48} weight="fill" />
            <p className="empty-state-text">Not following any stores yet</p>
            <Link to="/stores" className="empty-state-button">
              Discover Stores
            </Link>
          </div>
        ) : (
          <div className="followed-stores-grid">
            {followedStores.map((store) => (
              <Link key={store.id} to={`/store/${store.slug}`} className="followed-store-card">
                <div className="followed-store-image">
                  <img src={store.logoUrl} alt={store.name} />
                </div>
                <h4 className="followed-store-name">{store.name}</h4>
                <p className="followed-store-products">{store.productsCount} products</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default Profile;
