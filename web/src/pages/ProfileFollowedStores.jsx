import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Storefront as Store, MagnifyingGlass as Search, Package, Users, Bell, BellSlash as BellOff, X } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import {
  listMyFollowing,
  unfollowStore,
  setFollowNotifications,
  subscribeToFollowChanges,
} from '../lib/follow';
import { resolveImg } from '../lib/media';
import './ProfileFollowedStores.css';

const SORTS = [
  { key: 'recent', label: 'Recently followed' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'name', label: 'Name (A–Z)' },
];

function useDebounce(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

const ProfileFollowedStores = () => {
  const [rawSearch, setRawSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const search = useDebounce(rawSearch, 300);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listMyFollowing({ search, sort });
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err.message || 'Failed to load followed stores');
    } finally {
      setLoading(false);
    }
  }, [search, sort]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // Cross-tab sync: refetch on any follow change from other tabs
  useEffect(() => {
    return subscribeToFollowChanges(() => fetchList());
  }, [fetchList]);

  const handleUnfollow = async (storeId, storeName) => {
    setBusyId(storeId);
    try {
      await unfollowStore(storeId);
      setItems((list) => list.filter((it) => it.store.id !== storeId));
      toast.success(`Unfollowed ${storeName}`);
    } catch (err) {
      toast.error(err.message || 'Failed to unfollow');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleNotifs = async (storeId, enabled) => {
    setBusyId(storeId);
    try {
      const res = await setFollowNotifications(storeId, !enabled);
      setItems((list) => list.map((it) =>
        it.store.id === storeId
          ? { ...it, notificationsEnabled: res.notificationsEnabled }
          : it
      ));
      toast.success(res.notificationsEnabled ? 'Notifications enabled' : 'Notifications muted');
    } catch (err) {
      toast.error(err.message || 'Failed to update notifications');
    } finally {
      setBusyId(null);
    }
  };

  const isEmpty = !loading && items.length === 0;
  const hasFilters = !!search.trim();

  return (
    <div className="profile-page-wrap followed-page">
      <header className="profile-page-header">
        <div>
          <h1 className="profile-page-title">Followed Stores</h1>
          <p className="followed-subtitle">
            Get updates when your favorite stores add new products.
          </p>
        </div>
      </header>

      <div className="followed-toolbar">
        <div className="followed-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search followed stores…"
            value={rawSearch}
            onChange={(e) => setRawSearch(e.target.value)}
          />
          {rawSearch && (
            <button
              type="button"
              className="followed-search-clear"
              onClick={() => setRawSearch('')}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="followed-sort">
          <label>Sort:</label>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="followed-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="followed-card followed-skeleton" />
          ))}
        </div>
      ) : isEmpty ? (
        <div className="empty-state">
          <Store size={40} strokeWidth={1.5} />
          <p className="empty-state-text">
            {hasFilters ? 'No stores match your search' : 'You are not following any stores yet'}
          </p>
          <p className="empty-state-hint">
            {hasFilters
              ? 'Try a different keyword or clear the search.'
              : 'Discover local sellers and follow them to see their newest products first.'}
          </p>
          <Link to="/stores" className="empty-state-button">Discover Stores</Link>
        </div>
      ) : (
        <div className="followed-grid">
          {items.map((it) => (
            <FollowedStoreCard
              key={it.id}
              item={it}
              busy={busyId === it.store.id}
              onUnfollow={() => handleUnfollow(it.store.id, it.store.name)}
              onToggleNotifs={() => handleToggleNotifs(it.store.id, it.notificationsEnabled)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

function FollowedStoreCard({ item, busy, onUnfollow, onToggleNotifs }) {
  const { store, notificationsEnabled, followedAt } = item;
  const banner = store.bannerImage || store.coverImage;
  const initials = store.name
    ? store.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
    : '?';

  const followedLabel = useMemo(() => {
    if (!followedAt) return '';
    const d = new Date(followedAt);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }, [followedAt]);

  return (
    <div className="followed-card">
      <Link to={`/store/${store.slug}`} className="followed-banner">
        {banner ? (
          <img src={resolveImg(banner)} alt="" />
        ) : (
          <div className="followed-banner-fallback" />
        )}
      </Link>

      <div className="followed-body">
        <div className="followed-identity">
          <div className="followed-avatar">
            {store.logo ? (
              <img src={resolveImg(store.logo)} alt={store.name} />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <div className="followed-title">
            <Link to={`/store/${store.slug}`} className="followed-name">
              {store.name}
            </Link>
            {store.municipality?.name && (
              <span className="followed-location">{store.municipality.name}</span>
            )}
          </div>
        </div>

        {store.description && (
          <p className="followed-desc">{store.description}</p>
        )}

        <div className="followed-stats">
          <span><Package size={13} /> {store.productCount} products</span>
          <span><Users size={13} /> {store.followerCount} followers</span>
          <span className="followed-since">Followed {followedLabel}</span>
        </div>

        <div className="followed-actions">
          <button
            type="button"
            className={`followed-btn followed-btn-ghost ${notificationsEnabled ? '' : 'is-muted'}`}
            onClick={onToggleNotifs}
            disabled={busy}
            title={notificationsEnabled ? 'Mute notifications' : 'Enable notifications'}
          >
            {notificationsEnabled ? <Bell size={14} /> : <BellOff size={14} />}
            {notificationsEnabled ? 'Notifying' : 'Muted'}
          </button>
          <Link to={`/store/${store.slug}`} className="followed-btn followed-btn-outline">
            View shop
          </Link>
          <button
            type="button"
            className="followed-btn followed-btn-danger"
            onClick={onUnfollow}
            disabled={busy}
          >
            Unfollow
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProfileFollowedStores;
