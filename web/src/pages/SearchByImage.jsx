import React, { useEffect, useState, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Camera, CircleNotch as Loader2, ShoppingCart, Star, UploadSimple as Upload, ArrowLeft } from '@phosphor-icons/react';
import Layout from '../components/layout/Layout';
import ProductImage from '../components/ProductImage';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import useCartStore from '../store/cartStore';
import toast from 'react-hot-toast';
import './SearchByImage.css';

const SearchByImage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { addItem } = useCartStore();

  const [file, setFile] = useState(location.state?.file || null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');

  const runSearch = useCallback(async (imageFile) => {
    if (!imageFile) return;
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('image', imageFile);
      const res = await axios.post('/products/search-by-image', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const imageDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });
      sessionStorage.setItem('emoorm.image-search', JSON.stringify({
        results: res.data?.results || [],
        previewUrl: imageDataUrl,
      }));
      navigate('/products?imageSearch=1');
    } catch (err) {
      const msg = err.response?.data?.message || 'Image search failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    runSearch(file);
    return () => URL.revokeObjectURL(url);
  }, [file, runSearch]);

  useEffect(() => {
    const handlePaste = (event) => {
      const imageItem = Array.from(event.clipboardData?.items || [])
        .find((item) => item.type.startsWith('image/'));
      const pastedImage = imageItem?.getAsFile();
      if (pastedImage) setFile(pastedImage);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleAddToCart = (e, product) => {
    e.preventDefault();
    e.stopPropagation();
    addItem({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      image: product.images?.[0] || null,
      slug: product.slug,
      storeId: product.storeId,
    });
    toast.success('Added to cart');
  };

  return (
    <Layout>
      <div className="sbi-page">
        <div className="container">
          <button className="sbi-back" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} /> Back
          </button>

          <div className="sbi-header">
            <div className="sbi-header-left">
              <h1>Search by image</h1>
              <p>We find visually similar products from local sellers.</p>
            </div>

            <label className="sbi-upload-btn">
              <Upload size={16} />
              <span>Upload another image</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                hidden
              />
            </label>
          </div>

          <div className="sbi-body">
            <aside className="sbi-preview">
              {previewUrl ? (
                <img src={previewUrl} alt="Query" />
              ) : (
                <div className="sbi-preview-empty">
                  <Camera size={40} />
                  <p>No image selected</p>
                </div>
              )}
            </aside>

            <section className="sbi-results">
              {loading ? (
                <div className="sbi-status">
                  <Loader2 size={28} className="sbi-spin" />
                  <p>Analyzing image…</p>
                </div>
              ) : error ? (
                <div className="sbi-status sbi-status-error">
                  <p>{error}</p>
                </div>
              ) : results.length === 0 ? (
                <div className="sbi-status">
                  <p>No similar products found. Try a clearer photo of a single product.</p>
                </div>
              ) : (
                <>
                  <div className="sbi-results-head">
                    <span>{results.length} similar product{results.length === 1 ? '' : 's'}</span>
                  </div>
                  <div className="sbi-grid">
                    {results.map((product) => (
                      <Link
                        key={product.id}
                        to={`/product/${product.slug}`}
                        className="product-card"
                      >
                        <div className="product-image">
                          <ProductImage src={product.images?.[0]} alt={product.name} />
                          <span className="sbi-match">{product.matchSimilarity}% match</span>
                          <button
                            type="button"
                            className="product-cart-fab"
                            onClick={(e) => handleAddToCart(e, product)}
                            aria-label="Add to cart"
                          >
                            <ShoppingCart size={16} />
                          </button>
                        </div>
                        <div className="product-info">
                          <span className="product-name">{product.name}</span>
                          <span className="product-price">₱{Number(product.price).toFixed(2)}</span>
                          <div className="product-rating-row">
                            <div className="product-stars">
                              {[0, 1, 2, 3, 4].map((i) => (
                                <Star key={i} size={11} weight="fill" color="var(--t-warning-500, #f59e0b)" />
                              ))}
                            </div>
                            <span className="product-review-count">({product.reviewCount ?? 0})</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default SearchByImage;
