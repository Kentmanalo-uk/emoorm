import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, MapPin, Star } from '@phosphor-icons/react';
import Layout from '../components/layout/Layout';
import ProductImage from '../components/ProductImage';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import './MunicipalityShowcase.css';
import { HighlightCardsSkeleton } from '../components/ui/PageSkeletons';

const readList = (response) => Array.isArray(response?.data) ? response.data : [];

export default function MunicipalityShowcase() {
  const { id } = useParams();
  const [municipality, setMunicipality] = useState(null);
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    Promise.all([
      axios.get(`/municipalities/${id}`),
      axios.get('/stores', { params: { pageSize: 100, municipalityId: id } }),
      axios.get('/products', { params: { pageSize: 100, municipalityId: id, sortBy: 'createdAt', sortOrder: 'desc' } }),
    ]).then(([municipalityRes, storesRes, productsRes]) => {
      if (cancelled) return;
      setMunicipality(municipalityRes.data || null);
      setStores(readList(storesRes));
      setProducts(readList(productsRes));
    }).catch(() => {
      if (!cancelled) setError('Unable to load this municipality right now.');
    }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  const logo = municipality?.logo ? resolveImg(municipality.logo) : null;

  return (
    <Layout>
      <main className="municipality-showcase">
        <section className="municipality-hero" style={logo ? { '--municipality-logo': `url(${logo})` } : undefined}>
          <div className="municipality-hero-content">
            <div className="municipality-hero-logo">
              {logo ? <img src={logo} alt={`${municipality?.name || 'Municipality'} logo`} /> : <span>{municipality?.name?.charAt(0) || '?'}</span>}
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
                  <div className="municipality-feature-actions">
                    <Link to={`/products?municipalityId=${id}`} className="municipality-primary-action">View all products <ArrowRight size={16} /></Link>
                    <Link to={`/stores?municipalityId=${id}`} className="municipality-secondary-action">View all stores</Link>
                  </div>
                </div>
                <div className="municipality-gallery-stack-wrap">
                  <MunicipalityGalleryStack municipality={municipality} id={id} />
                </div>
              </section>

              <section className="municipality-content-section">
                <div className="section-header"><h2 className="section-title">Top Products</h2><Link to={`/products?municipalityId=${id}`} className="section-arrow-link" aria-label="View all products"><ArrowRight size={19} /></Link></div>
                {products.length > 0 ? (
                  <div className="municipality-product-grid">
                    {products.slice(0, 8).map((product) => (
                      <Link key={product.id} to={`/product/${product.slug}`} className="municipality-product-card">
                        <div className="municipality-product-image"><ProductImage src={product.images?.[0]} alt={product.name} /></div>
                        <div className="municipality-product-info">
                          <strong>{product.name}</strong>
                          <span className="municipality-product-price">₱{Number(product.price || 0).toFixed(2)}</span>
                          <div className="municipality-product-rating">
                            <div>{[0, 1, 2, 3, 4].map((star) => <Star key={star} size={11} weight="fill" color="var(--t-warning-500, #f59e0b)" />)}</div>
                            <span>({product.reviewCount ?? 0})</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : <div className="municipality-empty">No products are available yet.</div>}
              </section>

              <section className="municipality-content-section">
                <div className="section-header"><h2 className="section-title">Stores in {municipality?.name}</h2><Link to={`/stores?municipalityId=${id}`} className="section-arrow-link" aria-label="View all stores"><ArrowRight size={19} /></Link></div>
                {stores.length > 0 ? (
                  <div className="municipality-store-grid">
                    {stores.slice(0, 6).map((store) => (
                      <Link key={store.id} to={`/store/${store.slug}`} className="municipality-store-card">
                        <div className="municipality-store-logo">{store.logo ? <img src={resolveImg(store.logo)} alt={`${store.name} logo`} /> : <span>{store.name?.charAt(0)}</span>}</div>
                        <div><strong>{store.name}</strong><span>{store.pickupAddress || municipality?.name}</span></div><ArrowRight size={16} />
                      </Link>
                    ))}
                  </div>
                ) : <div className="municipality-empty">No stores are available yet.</div>}
              </section>
            </>
          )}
        </div>
      </main>
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
        {images.map((image, index) => <img key={`${image}-${index}`} src={resolveImg(image)} alt={`${municipality.name} gallery ${index + 1}`} style={{ '--stack-index': index }} />)}
      </Link>
      <Link to={`/municipality/${id}/gallery`} className="municipality-gallery-stack-link">View gallery <ArrowRight size={15} /></Link>
    </div>
  );
}
