import { useState, useEffect, useCallback } from 'react';
import EmptyState from '../components/ui/EmptyState';
import { Link } from 'react-router-dom';
import {
  MagnifyingGlass as Search, Bell, BellSlash as BellOff, UserMinus, X,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import {
  listMyFollowing,
  unfollowStore,
  setFollowNotifications,
  subscribeToFollowChanges,
} from '../lib/follow';
import { resolveImg } from '../lib/media';
import './ProfileFollowedStores.css';
import { StoreCardsSkeleton } from '../components/ui/PageSkeletons';
import Select from '../components/ui/Select';
import useStorePeek from '../components/peek/useStorePeek';

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
          <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort followed stores">
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </Select>
        </div>
      </div>

      {loading ? (
        <StoreCardsSkeleton count={4} />
      ) : isEmpty ? (
        <EmptyState
          page
          className="followed-empty"
          art={hasFilters ? 'search' : 'following'}
          title={hasFilters ? 'No stores match your search' : 'You are not following any stores yet'}
          text={hasFilters
            ? 'Try a different keyword or clear the search.'
            : 'Discover local sellers and follow them to see their newest products first.'}
          actions={[{ label: 'Discover Stores', to: '/stores' }]}
        />
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

/**
 * One followed shop, as in the app (mobile/app/followed-stores.js): no cover
 * photo and no card around it, a plain row with a hairline under it; a round
 * logo, the name, "Town | N Followers", then Notifying/Muted, View shop and
 * Unfollow. Held, the name shows the shop's preview, with Unfollow.
 */
function FollowedStoreCard({ item, busy, onUnfollow, onToggleNotifs }) {
  const { store, notificationsEnabled } = item;
  const peekStore = useStorePeek();
  const initials = store.name
    ? store.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
    : '?';
  const followers = store.followerCount ?? 0;
  const meta = [store.municipality?.name, `${followers} ${followers === 1 ? 'Follower' : 'Followers'}`]
    .filter(Boolean)
    .join(' | ');

  return (
    <div className="followed-card">
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
            <Link
              to={`/store/${store.slug}`}
              className="followed-name"
              {...peekStore(store, {
                follow: false,
                extra: [{ key: 'unfollow', label: 'Unfollow', Icon: UserMinus, danger: true, onClick: onUnfollow }],
              })}
            >
              {store.name}
            </Link>
            <span className="followed-location">{meta}</span>
          </div>
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
