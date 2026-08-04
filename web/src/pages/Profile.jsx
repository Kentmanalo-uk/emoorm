import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Edit, Package, Heart, MessageSquare, Bell, Store,
  ShoppingBag, Clock, Truck, CheckCircle,
} from 'lucide-react';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';
import './Profile.css';

const Profile = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();
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

      // TODO: Fetch followed stores when endpoint is available
      setFollowedStores([]);
    } catch (error) {
      console.error('Failed to fetch profile data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getOrderStatusBadge = (status) => {
    const badges = {
      PENDING: { label: 'Pending', color: '#f59e0b', icon: Clock },
      CONFIRMED: { label: 'Confirmed', color: '#3b82f6', icon: Package },
      PREPARING: { label: 'Preparing', color: '#8b5cf6', icon: Package },
      READY: { label: 'Ready', color: '#f97316', icon: Store },
      COMPLETED: { label: 'Completed', color: '#10b981', icon: CheckCircle },
      CANCELLED: { label: 'Cancelled', color: '#ef4444', icon: null },
    };
    return badges[status] || { label: status, color: '#6b7280', icon: null };
  };

  if (isLoading) {
    return (
      <div className="profile-loading">
        <div className="profile-loading-spinner"></div>
        <p>Loading profile...</p>
      </div>
    );
  }

  return (
    <>
      {/* Profile Header */}
      <div className="profile-header-card">
        <div className="profile-header-left">
          <div className="profile-avatar">
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.fullName} />
            ) : (
              <div className="profile-avatar-placeholder">
                {profile?.fullName?.charAt(0)?.toUpperCase() || 'U'}
              </div>
            )}
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
                <span className="profile-stat-number">4</span>
                <span className="profile-stat-label">Wishlist</span>
              </div>
              <div className="profile-stat-item">
                <span className="profile-stat-number">0</span>
                <span className="profile-stat-label">Reviews</span>
              </div>
            </div>
          </div>
        </div>
        <Link to="/profile/edit" className="profile-edit-button">
          <Edit size={18} />
          Edit Profile
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
          <Link to="/vouchers" className="service-item">
            <div className="service-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="7" width="20" height="10" rx="2" />
                <path d="M2 12h20" />
                <circle cx="12" cy="12" r="1" />
              </svg>
            </div>
            <span className="service-label">Vouchers</span>
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
            <Store size={48} />
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
