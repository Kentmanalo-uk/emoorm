import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { Check, CaretRight } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import ShopPreview from '../components/seller/ShopPreview';
import {
  SHOP_TEMPLATES, findTemplate, recommendTemplate, templateInUse,
} from '../lib/shopTemplates';
import './SellerDashboard.css';

/*
 * Decorate my shop: pick a ready-made look for the shop page (a template is
 * a pair of shop colours), or go to the logo, banner and custom colours.
 * The previews use the shop's real name, logo, banner and live products.
 */

/** Live products (for previews), their count, rating and followers, loaded once per page. */
function useShopFacts(storeId) {
  const [facts, setFacts] = useState({
    products: [], productCount: null, rating: null, followers: 0, loaded: false,
  });
  useEffect(() => {
    if (!storeId) return undefined;
    let cancelled = false;
    Promise.all([
      axios.get('/products/my/products', { params: { status: 'APPROVED', pageSize: 6 } }).then((r) => r.data || []).catch(() => []),
      axios.get('/stores/my/health').then((r) => r.data).catch(() => null),
    ]).then(([products, health]) => {
      if (cancelled) return;
      setFacts({
        products,
        productCount: health?.liveProducts ?? null,
        rating: health?.rating ?? null,
        followers: health?.followers ?? 0,
        loaded: true,
      });
    });
    return () => { cancelled = true; };
  }, [storeId]);
  return facts;
}

const previewProps = (facts) => ({
  products: facts.products,
  productCount: facts.productCount,
  rating: facts.rating,
  followers: facts.followers,
});

/** /seller/decorate */
export default function SellerDecorate() {
  const { store } = useOutletContext() || {};
  const facts = useShopFacts(store?.id);
  const inUse = templateInUse(store);
  const shown = inUse || SHOP_TEMPLATES[0];

  const blocks = [
    {
      key: 'look',
      title: 'Shop look',
      heading: 'Give your shop a look buyers remember',
      text: 'Pick a ready-made colour template for your shop page. You can change it any time.',
      to: '/seller/decorate/templates',
      note: inUse ? `In use: ${inUse.name}` : 'Using your own colours',
      art: (
        <div className="sdc-phone">
          <ShopPreview compact template={shown} store={store} {...previewProps(facts)} />
        </div>
      ),
    },
    {
      key: 'branding',
      title: 'Logo & banner',
      heading: 'Add your logo and a cover photo',
      text: 'A clear logo and a bright banner make your shop easy to recognise.',
      to: '/seller/store#branding',
      note: store?.logo ? 'Logo added' : 'No logo yet',
      art: (
        <div className="sdc-brand-art">
          <span className="sdc-brand-banner">
            {(store?.bannerImage || store?.coverImage) && <img src={resolveImg(store.bannerImage || store.coverImage)} alt="" />}
          </span>
          <span className="sdc-brand-logo">
            {store?.logo ? <img src={resolveImg(store.logo)} alt="" /> : (store?.name || 'S').charAt(0).toUpperCase()}
          </span>
        </div>
      ),
    },
    {
      key: 'colors',
      title: 'Your own colours',
      heading: 'Choose exact colours',
      text: 'Already have brand colours? Set them yourself.',
      to: '/seller/store#theme',
      note: null,
      art: (
        <div className="sdc-swatches">
          <span style={{ background: store?.primaryColor || '#059669' }} />
          <span style={{ background: store?.secondaryColor || '#F59E0B' }} />
        </div>
      ),
    },
  ];

  return (
    <div className="seller-dashboard sdc">
      <div className="seller-container sdc-body">
        {blocks.map((b) => (
          <section key={b.key} className="sdc-block">
            <h2 className="sdc-head">{b.title}</h2>
            <div className="sdc-row">
              <div className="sdc-art">{b.art}</div>
              <div className="sdc-copy">
                <h3>{b.heading}</h3>
                <p>{b.text}</p>
                <Link to={b.to} className="sdc-start">Start</Link>
                {b.note && <small>{b.note}</small>}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** /seller/decorate/templates */
export function SellerTemplates() {
  const { store } = useOutletContext() || {};
  const facts = useShopFacts(store?.id);
  const inUse = templateInUse(store);
  const recommended = recommendTemplate(facts.products.map((p) => p.category?.name));

  return (
    <div className="seller-dashboard stp">
      <div className="seller-container stp-grid">
        {SHOP_TEMPLATES.map((t) => {
          const isOn = inUse?.key === t.key;
          const isPick = !isOn && facts.loaded && recommended.key === t.key;
          return (
            <Link key={t.key} to={`/seller/decorate/templates/${t.key}`} className={`stp-card${isOn ? ' is-on' : ''}`}>
              <div className="stp-frame">
                <ShopPreview compact template={t} store={store} {...previewProps(facts)} />
                {(isOn || isPick) && (
                  <em className={`stp-tag${isOn ? ' is-on' : ''}`}>
                    {isOn ? <><Check size={11} weight="bold" /> In use</> : 'Recommended'}
                  </em>
                )}
              </div>
              <span className="stp-name">
                <strong>{t.name}</strong>
                <span className="stp-swatch" aria-hidden="true">
                  <i style={{ background: t.primary }} />
                  <i style={{ background: t.secondary }} />
                </span>
              </span>
              <span className="stp-tagline">{t.tagline}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** /seller/decorate/templates/:key */
export function SellerTemplatePreview() {
  const { key } = useParams();
  const navigate = useNavigate();
  const { store, setStore } = useOutletContext() || {};
  const facts = useShopFacts(store?.id);
  const template = findTemplate(key);
  const [applying, setApplying] = useState(false);
  const inUse = templateInUse(store)?.key === key;

  if (!template) {
    return (
      <div className="seller-dashboard">
        <div className="seller-container">
          <p className="sdm-empty">That template doesn&apos;t exist. <Link to="/seller/decorate/templates">See all templates</Link></p>
        </div>
      </div>
    );
  }

  const apply = async () => {
    if (!store?.id || applying) return;
    setApplying(true);
    try {
      const res = await axios.put(`/stores/${store.id}`, {
        primaryColor: template.primary,
        secondaryColor: template.secondary,
      });
      setStore?.((prev) => (prev ? { ...prev, ...(res.data || {}), primaryColor: template.primary, secondaryColor: template.secondary } : prev));
      toast.success(`${template.name} applied to your shop`);
      navigate('/seller/decorate', { replace: true });
    } catch (err) {
      toast.error(err.message || 'Could not apply the template');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="seller-dashboard stp-preview">
      <div className="seller-container stp-preview-body">
        <p className="stp-preview-note">{template.tagline}. This is how your shop page will look to buyers.</p>
        <div className="stp-preview-frame">
          <ShopPreview template={template} store={store} {...previewProps(facts)} />
        </div>
        {store?.slug && (
          <a href={`/store/${store.slug}`} target="_blank" rel="noreferrer" className="stp-live-link">
            See your live shop page <CaretRight size={13} weight="bold" />
          </a>
        )}
      </div>
      <div className="stp-apply-bar">
        <button type="button" className={`scm-btn${inUse ? ' is-done' : ''}`} onClick={apply} disabled={applying || inUse}>
          {inUse ? <><Check size={17} weight="bold" /> In use</> : applying ? 'Applying…' : `Apply ${template.name}`}
        </button>
      </div>
    </div>
  );
}
