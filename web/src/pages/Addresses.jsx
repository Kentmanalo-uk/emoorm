import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, Edit, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';
import './Addresses.css';

/**
 * Manages the user''s single profile delivery address via PUT /auth/profile.
 */
const Addresses = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user, updateUser } = useAuthStore();
  const [municipalities, setMunicipalities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({ barangay: '', address: '', municipalityId: '' });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login'); return; }
    const fetchData = async () => {
      try {
        const [profileRes, municipalitiesRes] = await Promise.all([
          axios.get('/auth/profile'),
          axios.get('/municipalities'),
        ]);
        const p = profileRes.data;
        setFormData({
          barangay: p.barangay || '',
          address: p.address || '',
          municipalityId: p.municipalityId || '',
        });
        setMunicipalities(municipalitiesRes.data || []);
      } catch (err) {
        toast.error('Failed to load address data');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [isAuthenticated, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) setFormErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const validate = () => {
    const errs = {};
    if (!formData.barangay.trim()) errs.barangay = 'Barangay is required.';
    if (!formData.address.trim()) errs.address = 'Street / house address is required.';
    if (!formData.municipalityId) errs.municipalityId = 'Municipality is required.';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const res = await axios.put('/auth/profile', {
        barangay: formData.barangay,
        address: formData.address,
      });
      updateUser(res.data);
      toast.success('Address updated successfully');
      setEditing(false);
    } catch (err) {
      toast.error(err.message || 'Failed to update address');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedMunicipality = municipalities.find((m) => m.id === formData.municipalityId);

  if (isLoading) {
    return (
      <div className="addresses-loading"><p>Loading...</p></div>
    );
  }

  return (
    <div className="profile-section">
      <div className="addresses-header">
        <h1 className="addresses-title">My Address</h1>
      </div>

      {!editing ? (
        <div className="address-card">
          <div className="address-default-badge"><Check size={14} /> Default</div>
          <div className="address-card-body">
            <h3 className="address-name">{user?.fullName}</h3>
            <p className="address-phone">{user?.contactNumber || '—'}</p>
            <div className="address-location">
              <MapPin size={16} />
              <div>
                <p>{formData.address || '—'}</p>
                <p>{formData.barangay || '—'}</p>
                <p>{selectedMunicipality?.name || user?.municipality?.name || '—'}, Oriental Mindoro</p>
              </div>
            </div>
          </div>
          <div className="address-card-actions">
            <button onClick={() => setEditing(true)} className="address-action-btn">
              <Edit size={16} /> Edit
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSave} className="address-edit-form">
          <div className="form-group">
            <label className="form-label">Street / House No.</label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              className={`form-input ${formErrors.address ? 'error' : ''}`}
              placeholder="123 Rizal St."
            />
            {formErrors.address && <span className="form-error">{formErrors.address}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Barangay</label>
            <input
              type="text"
              name="barangay"
              value={formData.barangay}
              onChange={handleChange}
              className={`form-input ${formErrors.barangay ? 'error' : ''}`}
              placeholder="Barangay Poblacion"
            />
            {formErrors.barangay && <span className="form-error">{formErrors.barangay}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Municipality</label>
            <select
              name="municipalityId"
              value={formData.municipalityId}
              onChange={handleChange}
              className={`form-input ${formErrors.municipalityId ? 'error' : ''}`}
            >
              <option value="">Select municipality</option>
              {municipalities.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            {formErrors.municipalityId && <span className="form-error">{formErrors.municipalityId}</span>}
          </div>

          <div className="address-edit-actions">
            <button type="button" onClick={() => setEditing(false)} className="btn-modal-cancel">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-modal-submit">
              {isSubmitting ? 'Saving...' : 'Save Address'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default Addresses;
