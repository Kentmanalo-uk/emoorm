import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from '../lib/axios';
import { policy } from '../lib/queryKeys';
import useAuthStore from '../store/authStore';
import { Camera, MapPin, Storefront, House } from '../lib/icons';
import Layout from '../components/layout/Layout';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import LoadFailed from '../components/ui/LoadFailed';
import { MountainArt } from '../components/art/FlatArt';
import useShortcutLook from '../hooks/useShortcutLook';
import { usePhoneLayout } from '../hooks/useMobileNav';
import { useMunicipalities } from '../hooks/useReferenceData';
import { resolveImg, srcSetFor } from '../lib/media';
import useSeo from '../lib/seo';
import './ExploreMindoro.css';

/*
 * Explore Mindoro (/explore): the towns of Oriental Mindoro, each a card with
 * a cover from its photo gallery (or its logo), its name and line, and how
 * many photos and shops it has. A town with photos opens its gallery; one
 * without, its own page (shops and products). Towns with photos come first.
 */
export default function ExploreMindoro() {
  useSeo({ title: 'Explore Mindoro', description: 'The towns of Oriental Mindoro in photos, and the local shops in each, on E-MOORM.' });
  const isPhone = usePhoneLayout();
  const look = useShortcutLook();
  const { municipalities, isLoading, isError, refetch } = useMunicipalities();
  const shopCounts = useShopCounts();

  const towns = useMemo(() => {
    const list = municipalities.filter((m) => m.isActive !== false);
    const photos = (m) => (Array.isArray(m.gallery) ? m.gallery.filter(Boolean).length : 0);
    return [...list].sort((a, b) => (photos(b) > 0) - (photos(a) > 0) || a.name.localeCompare(b.name));
  }, [municipalities]);

  let body;
  if (isLoading) {
    body = (
      <div className="exm-grid" aria-busy="true">
        {Array.from({ length: isPhone ? 4 : 8 }, (_, i) => <Skeleton key={i} className="exm-skel" radius={18} style={{ height: 'auto' }} />)}
      </div>
    );
  } else if (isError && towns.length === 0) {
    body = <LoadFailed what="the towns" onRetry={refetch} />;
  } else if (towns.length === 0) {
    body = (
      <EmptyState
        art="places"
        roomy
        title="No towns to show yet"
        text="The towns of Oriental Mindoro will show here as they join E-MOORM."
        actions={[{ label: 'Back to Home', to: '/', icon: House }]}
      />
    );
  } else {
    body = (
      <div className="exm-grid">
        {towns.map((town, i) => (
          <TownCard key={town.id} town={town} shops={shopCounts ? (shopCounts[town.id] || 0) : null} wide={!isPhone && i === 0} />
        ))}
      </div>
    );
  }

  return (
    <Layout>
      <div className={`exm${isPhone ? ' is-phone' : ''}`}>
        <div className="exm-container">
          {!isPhone && (
            <nav className="exm-crumbs" aria-label="Breadcrumb">
              <Link to="/">Home</Link>
              <span aria-hidden="true">/</span>
              <span>Explore Mindoro</span>
            </nav>
          )}
          <header className="exm-head">
            <span className="exm-art" aria-hidden="true"><MountainArt size={isPhone ? 40 : 56} look={look} /></span>
            <div className="exm-head-text">
              <h1 className="exm-title">Explore Mindoro</h1>
              <p className="exm-line">The towns of Oriental Mindoro in photos, and the local shops in each.</p>
            </div>
          </header>
          {body}
        </div>
      </div>
    </Layout>
  );
}

// The public shop directory, at most this many pages of 50, is counted by
// town; a longer one shows no counts rather than short ones.
const SHOP_PAGES = 4;

/**
 * Each town's open shops, from the public directory (GET /stores: only
 * approved, open shops, as /stores lists them), as { municipalityId: n }.
 * null while loading, on an error, or when the directory is too long.
 */
function useShopCounts() {
  // An admin's directory lists every shop (a town admin's, only their own
  // town's): not the public counts.
  const role = useAuthStore((s) => s.user?.role);
  const admin = role === 'SUPER_ADMIN' || role === 'MUNICIPAL_ADMIN';
  const { data } = useQuery({
    enabled: !admin,
    queryKey: ['stores', 'explore-counts'],
    queryFn: async () => {
      const page = (n) => axios.get('/stores', { params: { page: n, pageSize: 50 }, quiet: true });
      const first = await page(1);
      const pages = first.pagination?.totalPages || 1;
      if (pages > SHOP_PAGES) return null;
      const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) => page(i + 2)));
      const counts = {};
      [first, ...rest].forEach((res) => (res.data || []).forEach((s) => {
        if (s.municipalityId) counts[s.municipalityId] = (counts[s.municipalityId] || 0) + 1;
      }));
      return counts;
    },
    ...policy.publicContent,
  });
  return admin ? null : data || null;
}

/** A town: its cover (the gallery's first photo, else its logo), name, line, counts. */
function TownCard({ town, shops, wide }) {
  const gallery = Array.isArray(town.gallery) ? town.gallery.filter(Boolean) : [];
  const [failed, setFailed] = useState(false);
  const cover = gallery[0] && !failed ? resolveImg(gallery[0]) : null;
  const logo = town.logo ? resolveImg(town.logo) : null;
  const to = gallery.length ? `/municipality/${town.id}/gallery` : `/municipality/${town.id}`;
  const label = gallery.length
    ? `${town.name}: ${gallery.length} ${gallery.length === 1 ? 'photo' : 'photos'}`
    : `${town.name}: shops and products`;

  return (
    <Link to={to} className={`exm-card${wide ? ' is-wide' : ''}${cover ? '' : ' is-plain'}`} aria-label={label}>
      {cover ? (
        <img
          className="exm-cover"
          src={cover}
          srcSet={srcSetFor(gallery[0])}
          sizes={wide ? '(max-width: 768px) 100vw, 640px' : '(max-width: 768px) 50vw, 320px'}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="exm-cover is-logo" aria-hidden="true">
          {logo ? <img src={logo} srcSet={srcSetFor(town.logo)} sizes="120px" alt="" loading="lazy" decoding="async" /> : <MapPin size={44} weight="fill" />}
        </span>
      )}
      <span className="exm-shade" aria-hidden="true" />
      <span className="exm-text">
        {cover && logo && <img className="exm-seal" src={logo} alt="" loading="lazy" decoding="async" />}
        <strong className="exm-name">{town.name}</strong>
        {town.tagline && <span className="exm-tagline">{town.tagline}</span>}
        <span className="exm-meta">
          {gallery.length > 0 && (
            <span><Camera size={13} weight="fill" /> {gallery.length} {gallery.length === 1 ? 'photo' : 'photos'}</span>
          )}
          {shops > 0 && (
            <span><Storefront size={13} weight="fill" /> {shops} {shops === 1 ? 'shop' : 'shops'}</span>
          )}
        </span>
      </span>
    </Link>
  );
}
