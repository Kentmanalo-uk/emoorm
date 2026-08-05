import React, { useState, useEffect } from 'react';
import { Store, Save, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import Skeleton from '../components/ui/Skeleton';
import './SellerDashboard.css';
import './SellerStore.css';

export default function SellerStore() {
  const [store, setStore] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    address: '',
    contactNumber: '',
    isActive: true,
  });
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    loadStore();
  }, []);

  const loadStore = async () => {
    try {
      const res = await axios.get('/stores/my/store');
      setStore(res.data);
      setForm({
        name: res.data.name || '',
        description: res.data.description || '',
        address: res.data.address || '',
        contactNumber: res.data.contactNumber || '',
        isActive: res.data.isActive ?? true,
      });
    } catch (err) {
      // 404 = no store yet
      if (err.status === 404 || (typeof err.message === 'string' && err.message.includes('404'))) {
        setIsNew(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Store name is required'); return; }
    setIsSaving(true);
    try {
      if (isNew) {
        const res = await axios.post('/stores', form);
        setStore(res.data);
        setIsNew(false);
        toast.success('Store created successfully!');
      } else {
        const res = await axios.put(`/stores/${store.id}`, form);
        setStore(res.data);
        toast.success('Store updated!');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to save store');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <div className="seller-header">
          <div>
            <h1>{isNew ? 'Create Your Store' : 'Store Settings'}</h1>
            <p className="seller-welcome">Your public storefront details</p>
          </div>
        </div>

        {isLoading ? (
          <div className="seller-card">
            <Skeleton.Text lines={2} height={14} />
            <div style={{ height: 12 }} />
            <Skeleton.Text lines={4} height={12} />
            <div style={{ height: 12 }} />
            <Skeleton height={38} width={140} radius={8} />
          </div>
        ) : (
          <div className="store-form-layout">
            <div className="seller-card">
              <div className="seller-card-header">
                <h2><Store size={18} /> Store Information</h2>
              </div>
              <form onSubmit={handleSubmit} className="store-form">
                <div className="form-group">
                  <label>Store Name <span className="required">*</span></label>
                  <input
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="e.g. Maria's Fresh Farm"
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    name="description"
                    value={form.description}
                    onChange={handleChange}
                    placeholder="Tell buyers about your store and what you sell..."
                    className="form-input form-textarea"
                    rows={4}
                  />
                </div>

                <div className="form-group">
                  <label>Store Address</label>
                  <input
                    type="text"
                    name="address"
                    value={form.address}
                    onChange={handleChange}
                    placeholder="Barangay, Municipality, Oriental Mindoro"
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label>Contact Number</label>
                  <input
                    type="text"
                    name="contactNumber"
                    value={form.contactNumber}
                    onChange={handleChange}
                    placeholder="09XXXXXXXXX"
                    className="form-input"
                  />
                </div>

                {!isNew && (
                  <div className="form-group form-toggle">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        name="isActive"
                        checked={form.isActive}
                        onChange={handleChange}
                      />
                      <span className="toggle-text">
                        Store is <strong>{form.isActive ? 'Active' : 'Inactive'}</strong>
                        {!form.isActive && (
                          <span className="toggle-warn">
                            <AlertCircle size={14} /> Buyers won't see your store or products
                          </span>
                        )}
                      </span>
                    </label>
                  </div>
                )}

                <div className="form-actions">
                  <button type="submit" className="btn-seller-primary" disabled={isSaving}>
                    <Save size={16} />
                    {isSaving ? 'Saving…' : isNew ? 'Create Store' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>

            {/* Store slug / link */}
            {store?.slug && (
              <div className="seller-card store-preview-card">
                <div className="seller-card-header">
                  <h2>Public Store Link</h2>
                </div>
                <div className="store-slug-info">
                  <p className="store-slug-label">Your store URL:</p>
                  <a
                    href={`/store/${store.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="store-slug-link"
                  >
                    emoorm.app/store/{store.slug}
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
