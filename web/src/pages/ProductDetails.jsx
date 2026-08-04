import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ShoppingCart, Heart, Share2, Store, MapPin,
  Star, ChevronLeft, ChevronRight, Minus, Plus, Package, Truck, Flag
} from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../components/layout/Layout';
import ReportModal from '../components/ReportModal';
import axios from '../lib/axios';
import useCartStore from '../store/cartStore';
import useAuthStore from '../store/authStore';
import useWishlistStore from '../store/wishlistStore';
import './ProductDetails.css';

const ProductDetails = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { addItem } = useCartStore();
  const { toggleItem, isInWishlist } = useWishlistStore();

  const [product, setProduct] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    fetchProduct();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [slug]);

  const fetchProduct = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get(`/products/slug/${slug}`);
      setProduct(response.data);

      // Fetch related products
      if (response.data?.categoryId) {
        fetchRelatedProducts(response.data.categoryId, response.data.id);
      }

      // Fetch reviews
      if (response.data?.id) {
        fetchReviews(response.data.id);
      }
    } catch (error) {
      console.error('Failed to fetch product:', error);
      // If product not found, redirect to products page
      if (error.status === 404) {
        navigate('/products');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRelatedProducts = async (categoryId, productId) => {
    try {
      const response = await axios.get('/products', {
        params: {
          categoryId,
          pageSize: 4,
        },
      });
      // Filter out current product
      const filtered = (response.data || []).filter(p => p.id !== productId);
      setRelatedProducts(filtered.slice(0, 4));
    } catch (error) {
      console.error('Failed to fetch related products:', error);
    }
  };

  const fetchReviews = async (productId) => {
    try {
      const response = await axios.get(`/reviews/product/${productId}`);
      setReviews(response.data || []);
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
    }
  };

  const handleAddToCart = () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    setIsAddingToCart(true);
    try {
      addItem({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.images?.[0] || '/placeholder-product.png',
        storeId: product.storeId,
        storeName: product.store?.name,
        stock: product.stock,
        slug: product.slug,
      }, quantity);

      toast.success('Product added to cart!');
    } catch (error) {
      console.error('Failed to add to cart:', error);
      toast.error(error.message || 'Failed to add product to cart');
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleBuyNow = () => {
    handleAddToCart();
    setTimeout(() => {
      navigate('/cart');
    }, 300);
  };

  const handleQuantityChange = (delta) => {
    const newQuantity = quantity + delta;
    if (newQuantity >= 1 && newQuantity <= product.stock) {
      setQuantity(newQuantity);
    }
  };

  const nextImage = () => {
    if (product?.images) {
      setSelectedImage((prev) => (prev + 1) % product.images.length);
    }
  };

  const prevImage = () => {
    if (product?.images) {
      setSelectedImage((prev) => (prev - 1 + product.images.length) % product.images.length);
    }
  };

  const renderStars = (rating) => {
    return [...Array(5)].map((_, index) => (
      <Star
        key={index}
        size={16}
        fill={index < rating ? '#f59e0b' : 'none'}
        stroke={index < rating ? '#f59e0b' : '#d1d5db'}
      />
    ));
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="product-details-loading">
          <div className="loading-spinner"></div>
          <p>Loading product...</p>
        </div>
      </Layout>
    );
  }

  if (!product) {
    return (
      <Layout>
        <div className="product-not-found">
          <Package size={64} />
          <h2>Product not found</h2>
          <Link to="/products" className="back-to-products-btn">
            Browse Products
          </Link>
        </div>
      </Layout>
    );
  }

  const images = product.images || ['/placeholder-product.png'];
  const isOutOfStock = product.stock === 0;

  return (
    <Layout>
      <div className="product-details-page">
        {/* Breadcrumbs */}
        <div className="container">
          <div className="breadcrumbs">
            <Link to="/">Home</Link>
            <span className="breadcrumb-separator">/</span>
            <Link to="/products">Products</Link>
            <span className="breadcrumb-separator">/</span>
            {product.category && (
              <>
                <Link to={`/products?category=${product.categoryId}`}>
                  {product.category.name}
                </Link>
                <span className="breadcrumb-separator">/</span>
              </>
            )}
            <span className="breadcrumb-current">{product.name}</span>
          </div>
        </div>

        <div className="container">
          {/* Main Product Section */}
          <div className="product-main-section">
            {/* Image Gallery */}
            <div className="product-gallery">
              <div className="gallery-main">
                <img
                  src={images[selectedImage]}
                  alt={product.name}
                  className="gallery-main-image"
                />
                {images.length > 1 && (
                  <>
                    <button onClick={prevImage} className="gallery-nav gallery-nav-prev">
                      <ChevronLeft size={24} />
                    </button>
                    <button onClick={nextImage} className="gallery-nav gallery-nav-next">
                      <ChevronRight size={24} />
                    </button>
                  </>
                )}
              </div>
              {images.length > 1 && (
                <div className="gallery-thumbnails">
                  {images.map((image, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedImage(index)}
                      className={`gallery-thumbnail ${selectedImage === index ? 'active' : ''}`}
                    >
                      <img src={image} alt={`${product.name} ${index + 1}`} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product Info */}
            <div className="product-info-section">
              <h1 className="product-title">{product.name}</h1>

              {/* Rating */}
              {product.averageRating > 0 && (
                <div className="product-rating-row">
                  <div className="rating-stars">
                    {renderStars(Math.round(product.averageRating))}
                  </div>
                  <span className="rating-score">{product.averageRating.toFixed(1)}</span>
                  <span className="rating-count">({product.reviewCount} reviews)</span>
                </div>
              )}

              {/* Price */}
              <div className="product-price-section">
                <span className="product-price">₱{Number(product.price).toFixed(2)}</span>
                {product.compareAtPrice && product.compareAtPrice > product.price && (
                  <span className="product-compare-price">₱{Number(product.compareAtPrice).toFixed(2)}</span>
                )}
              </div>

              {/* Description */}
              <div className="product-description">
                <h3>Description</h3>
                <p>{product.description || 'No description available.'}</p>
              </div>

              {/* Stock Status */}
              <div className="product-stock">
                {isOutOfStock ? (
                  <span className="stock-status out-of-stock">Out of Stock</span>
                ) : product.stock < 10 ? (
                  <span className="stock-status low-stock">
                    Only {product.stock} left in stock
                  </span>
                ) : (
                  <span className="stock-status in-stock">In Stock</span>
                )}
              </div>

              {/* Quantity Selector */}
              {!isOutOfStock && (
                <div className="quantity-section">
                  <label>Quantity:</label>
                  <div className="quantity-selector">
                    <button
                      onClick={() => handleQuantityChange(-1)}
                      disabled={quantity <= 1}
                      className="quantity-btn"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="quantity-display">{quantity}</span>
                    <button
                      onClick={() => handleQuantityChange(1)}
                      disabled={quantity >= product.stock}
                      className="quantity-btn"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <span className="quantity-max">{product.stock} available</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="product-actions">
                <button
                  onClick={handleAddToCart}
                  disabled={isOutOfStock || isAddingToCart}
                  className="btn-add-to-cart"
                >
                  <ShoppingCart size={20} />
                  {isAddingToCart ? 'Adding...' : 'Add to Cart'}
                </button>
                <button
                  onClick={handleBuyNow}
                  disabled={isOutOfStock || isAddingToCart}
                  className="btn-buy-now"
                >
                  Buy Now
                </button>
              </div>

              {/* Secondary Actions */}
              <div className="product-secondary-actions">
                <button
                  className={`secondary-action-btn ${isInWishlist(product.id) ? 'wishlist-active' : ''}`}
                  onClick={() => {
                    if (!isAuthenticated) { navigate('/login'); return; }
                    const wasIn = isInWishlist(product.id);
                    toggleItem(product);
                    toast.success(wasIn ? 'Removed from wishlist' : 'Saved to wishlist');
                  }}
                >
                  <Heart size={20} fill={isInWishlist(product.id) ? '#ef4444' : 'none'} />
                  {isInWishlist(product.id) ? 'Saved' : 'Add to Wishlist'}
                </button>
                <button className="secondary-action-btn">
                  <Share2 size={20} />
                  Share
                </button>
                <button
                  className="secondary-action-btn secondary-action-report"
                  onClick={() => {
                    if (!isAuthenticated) { toast.error('Please login to report'); return; }
                    setShowReport(true);
                  }}
                >
                  <Flag size={16} />
                  Report
                </button>
              </div>

              {/* Shipping Info */}
              <div className="shipping-info">
                <div className="shipping-item">
                  <Truck size={20} />
                  <div>
                    <strong>Free Delivery</strong>
                    <span>For orders over ₱500</span>
                  </div>
                </div>
                <div className="shipping-item">
                  <Package size={20} />
                  <div>
                    <strong>Ready to Ship</strong>
                    <span>Ships within 2-3 business days</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Store Info */}
            <div className="store-info-card">
              <div className="store-header">
                <div className="store-avatar">
                  {product.store?.logoUrl ? (
                    <img src={product.store.logoUrl} alt={product.store.name} />
                  ) : (
                    <Store size={24} />
                  )}
                </div>
                <div className="store-details">
                  <h3>{product.store?.name || 'Store'}</h3>
                  {product.store?.municipality && (
                    <p className="store-location">
                      <MapPin size={14} />
                      {product.store.municipality.name}
                    </p>
                  )}
                </div>
              </div>
              <Link
                to={`/store/${product.store?.slug}`}
                className="btn-visit-store"
              >
                Visit Store
              </Link>
            </div>
          </div>

          {/* Reviews Section */}
          {reviews.length > 0 && (
            <div className="reviews-section">
              <h2>Customer Reviews</h2>
              <div className="reviews-list">
                {reviews.slice(0, 5).map((review) => (
                  <div key={review.id} className="review-card">
                    <div className="review-header">
                      <div className="review-author">
                        <div className="author-avatar">
                          {review.buyer?.fullName?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <strong>{review.buyer?.fullName || 'Anonymous'}</strong>
                          <div className="review-stars">
                            {renderStars(review.rating)}
                          </div>
                        </div>
                      </div>
                      <span className="review-date">
                        {new Date(review.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="review-comment">{review.comment}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Related Products */}
          {relatedProducts.length > 0 && (
            <div className="related-products-section">
              <h2>Related Products</h2>
              <div className="related-products-grid">
                {relatedProducts.map((relatedProduct) => (
                  <Link
                    key={relatedProduct.id}
                    to={`/product/${relatedProduct.slug}`}
                    className="related-product-card"
                  >
                    <div className="related-product-image">
                      <img
                        src={relatedProduct.images?.[0] || '/placeholder-product.png'}
                        alt={relatedProduct.name}
                      />
                    </div>
                    <div className="related-product-info">
                      <h4>{relatedProduct.name}</h4>
                      <span className="related-product-price">
                        ₱{Number(relatedProduct.price).toFixed(2)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showReport && product && (
        <ReportModal
          type="PRODUCT"
          productId={product.id}
          targetName={product.name}
          onClose={() => setShowReport(false)}
        />
      )}
    </Layout>
  );
};

export default ProductDetails;
