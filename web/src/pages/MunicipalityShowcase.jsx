import EmptyArt from '../components/ui/EmptyArt';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, MapPin } from '../lib/icons';
import Layout from '../components/layout/Layout';
import axios from '../lib/axios';
import { resolveImg, srcSetFor } from '../lib/media';
import './MunicipalityShowcase.css';
import ProductTile from '../components/product/ProductTile';
import { HighlightCardsSkeleton } from '../components/ui/PageSkeletons';
import Skeleton from '../components/ui/Skeleton';
import ListEnd from '../components/ui/ListEnd';
import { ShopLogoArt } from '../components/shop/ShopArt';
import useInfiniteList from '../hooks/useInfiniteList';
import { readCache, writeCache, usePageCache } from '../lib/pageCache';

const readList = (response) => Array.isArray(response?.data) ? response.data : [];

// The town's products per batch; the next comes on its own as the end of
// the grid nears, so every one of them shows. Fills whole rows (6 / 4 / 2).
const BATCH = 24;
// Kept for this visit, so Back finds the town, its products loaded so far
// and the spot in them as left.
const pageKey = (id) => `municipality:${id}`;
const productsKey = (id) => `municipality-products:${id}`;

export default function MunicipalityShowcase() {
  const { id } = useParams();
  // The town and its shops (the strip shows six, with "View all stores").
  const { data, loading: isLoading, error: loadError } = usePageCache(pageKey(id), async () => {
    const [municipalityRes, storesRes] = await Promise.all([
      axios.get(`/municipalities/${id}`),
      axios.get('/stores', { params: { pageSize: 100, municipalityId: id } }),
    ]);
    return { municipality: municipalityRes.data || null, stores: readList(storesRes) };
  });
  const municipality = data?.municipality || null;
  const stores = data?.stores || [];
  const error = loadError && !data ? 'Unable to load this municipality right now.' : '';

  // Every product of the town, newest first, a batch at a time.
  const products = useInfiniteList({
    listKey: productsKey(id),
    loadPage: async (page) => {
      const res = await axios.get('/products', {
        params: { page, pageSize: BATCH, municipalityId: id, sortBy: 'createdAt', sortOrder: 'desc' },
      });
      const list = readList(res);
      return { items: list, total: res.pagination?.total ?? list.length, totalPages: res.pagination?.totalPages ?? 1 };
    },
    readSaved: readCache,
    save: (key, saved) => writeCache(key, saved, { visitOnly: true }),
  });

  const logo = municipality?.logo ? resolveImg(municipality.logo) : null;

  return (
    <Layout>
      <div className="municipality-showcase">
        <section className="municipality-hero" style={logo ? { '--municipality-logo': `url(${logo})` } : undefined}>
          <div className="municipality-hero-content">
            <div className="municipality-hero-logo">
              {logo ? <img src={logo} srcSet={srcSetFor(logo)} sizes="96px" alt={`${municipality?.name || 'Municipality'} logo`} /> : <span>{municipality?.name?.charAt(0) || '?'}</span>}
            </div>
            <div>
              <h1>{municipality?.name || 'Municipality'}</h1>
              <p className="municipality-hero-location"><MapPin size={16} weight="fill" /> Stores, products, and makers from this community</p>
            </div>
          </div>
        </section>

        <div className="container municipality-showcase-content">
          {error && <div className="municipality-error">{error}</div>}
          {isLoading ? (
            <HighlightCardsSkeleton />
          ) : (
            <>
              <section className="municipality-feature-grid">
                <div className="municipality-feature-copy">
                  <h2>{municipality?.tagline || `${municipality?.name || 'This community'}, made local.`}</h2>
                  <p>{municipality?.description || `Discover the people, products, and small businesses that make ${municipality?.name || 'this municipality'} special.`}</p>
                  {/* The municipal office, when the town has filled it in (Settings). */}
                  {(municipality?.officeAddress || municipality?.officeHours || municipality?.officePhone || municipality?.officeEmail) && (
                    <dl className="municipality-office">
                      {municipality.officeAddress && <><dt>Municipal office</dt><dd>{municipality.officeAddress}</dd></>}
                      {municipality.officeHours && <><dt>Open</dt><dd>{municipality.officeHours}</dd></>}
                      {municipality.officePhone && <><dt>Phone</dt><dd><a href={`tel:${municipality.officePhone.replace(/[^0-9+]/g, '')}`}>{municipality.officePhone}</a></dd></>}
                      {municipality.officeEmail && <><dt>Email</dt><dd><a href={`mailto:${municipality.officeEmail}`}>{municipality.officeEmail}</a></dd></>}
                    </dl>
                  )}
                  <div className="municipality-feature-actions">
                    <Link to={`/products?municipalityId=${id}`} className="municipality-primary-action">View all products <ArrowRight size={16} /></Link>
                    <Link to={`/stores?municipalityId=${id}`} className="municipality-secondary-action">View all stores</Link>
                  </div>
                </div>
                <div className="municipality-gallery-stack-wrap">
                  <MunicipalityGalleryStack municipality={municipality} id={id} />
                </div>
              </section>

              {/* The shops first: the products below run on to the very end. */}
              <section className="municipality-content-section">
                <div className="section-header"><h2 className="section-title">Stores in {municipality?.name}</h2><Link to={`/stores?municipalityId=${id}`} className="section-arrow-link" aria-label="View all stores"><ArrowRight size={19} /></Link></div>
                {stores.length > 0 ? (
                  <div className="municipality-store-grid">
                    {stores.slice(0, 6).map((store) => (
                      <Link key={store.id} to={`/store/${store.slug}`} className="municipality-store-card">
                        <div className="municipality-store-logo">{store.logo ? <img src={resolveImg(store.logo)} srcSet={srcSetFor(store.logo)} sizes="56px" alt={`${store.name} logo`} loading="lazy" decoding="async" /> : <ShopLogoArt name={store.name} />}</div>
                        <div><strong>{store.name}</strong><span>{store.pickupAddress || municipality?.name}</span></div><ArrowRight size={16} />
                      </Link>
                    ))}
                  </div>
                ) : <div className="municipality-empty"><EmptyArt name="stores" size={80} /><span>No stores are available yet.</span></div>}
              </section>

              <section className="municipality-content-section">
                <div className="section-header"><h2 className="section-title">Products</h2><Link to={`/products?municipalityId=${id}`} className="section-arrow-link" aria-label="View all products"><ArrowRight size={19} /></Link></div>
                {products.loading ? (
                  <Skeleton.Cards count={12} />
                ) : products.items.length > 0 ? (
                  <>
                    <div className="municipality-product-grid">
                      {products.items.map((product) => (
                        <ProductTile key={product.id} product={product} />
                      ))}
                    </div>
                    <ListEnd list={products} done={products.total > BATCH ? `That’s every product from ${municipality?.name || 'this town'}` : ''} />
                  </>
                ) : <div className="municipality-empty"><EmptyArt name="products" size={80} /><span>{products.error ? 'Couldn’t load the products right now.' : 'No products are available yet.'}</span></div>}
              </section>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}

function MunicipalityGalleryStack({ municipality, id }) {
  const images = Array.isArray(municipality?.gallery) ? municipality.gallery.slice(0, 3) : [];
  if (images.length === 0) {
    return <Link to={`/municipality/${id}/gallery`} className="municipality-gallery-stack-empty">View gallery <ArrowRight size={16} /></Link>;
  }
  return (
    <div className="municipality-gallery-stack-card">
      <Link to={`/municipality/${id}/gallery`} className="municipality-gallery-stack" aria-label={`View ${municipality.name} gallery`}>
        {images.map((image, index) => <img key={`${image}-${index}`} src={resolveImg(image)} srcSet={srcSetFor(image)} sizes="(max-width: 768px) 80vw, 420px" alt={`${municipality.name} gallery ${index + 1}`} style={{ '--stack-index': index }} loading="lazy" decoding="async" />)}
      </Link>
      <Link to={`/municipality/${id}/gallery`} className="municipality-gallery-stack-link">View gallery <ArrowRight size={15} /></Link>
    </div>
  );
}
