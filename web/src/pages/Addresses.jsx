import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Check, Plus, PencilSimple as Pencil, Trash as Trash2, Star } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';
import Skeleton from '../components/ui/Skeleton';
import PhAddressPicker from '../components/common/PhAddressPicker';
import './Addresses.css';

const emptyForm = {
  label: '',
  fullName: '',
  contactNumber: '',
  province: 'Oriental Mindoro',
  provinceCode: '',
  municipalityId: '',
  municipalityName: '',
  municipalityCode: '',
  barangay: '',
  barangayCode: '',
  street: '',
};

/**
 * Manages the buyer's saved delivery addresses (add / edit / delete / set default)
 * via /addresses (list, create, update, delete, set-default).
 */
const Addresses = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const [municipalities, setMunicipalities] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const loadAddresses = async () => {
    const res = await axios.get('/addresses');
    setAddresses(res.data || []);
  };

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login'); return; }
    const fetchData = async () => {
      try {
        const [municipalitiesRes] = await Promise.all([
          axios.get('/municipalities'),
          loadAddresses(),
        ]);
        setMunicipalities(municipalitiesRes.data || []);
      } catch (err) {
        toast.error('Failed to load address data');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) setFormErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const validate = () => {
    const errs = {};
    if (!formData.fullName.trim()) errs.fullName = 'Recipient name is required.';
    if (!formData.contactNumber.trim()) errs.contactNumber = 'Contact number is required.';
    if (!formData.province) errs.province = 'Province is required.';
    if (!formData.municipalityId) errs.municipalityId = 'City / Municipality is required.';
    if (!formData.barangay.trim()) errs.barangay = 'Barangay is required.';
    if (!formData.street.trim()) errs.street = 'Street / house address is required.';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const openAddForm = () => {
    setEditingId(null);
    setFormData({
      ...emptyForm,
      fullName: user?.fullName || '',
      contactNumber: user?.contactNumber || '',
    });
    setFormErrors({});
    setFormOpen(true);
  };

  const openEditForm = (addr) => {
    setEditingId(addr.id);
    setFormData({
      label: addr.label || '',
      fullName: addr.fullName || '',
      contactNumber: addr.contactNumber || '',
      province: addr.province || 'Oriental Mindoro',
      provinceCode: '',
      municipalityId: addr.municipalityId || '',
      municipalityName: addr.municipality?.name || '',
      municipalityCode: '',
      barangay: addr.barangay || '',
      barangayCode: '',
      street: addr.street || '',
    });
    setFormErrors({});
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setFormData(emptyForm);
    setFormErrors({});
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      if (editingId) {
        await axios.put(`/addresses/${editingId}`, formData);
        toast.success('Address updated');
      } else {
        await axios.post('/addresses', formData);
        toast.success('Address added');
      }
      await loadAddresses();
      closeForm();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save address');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetDefault = async (addr) => {
    if (addr.isDefault) return;
    setBusyId(addr.id);
    try {
      await axios.put(`/addresses/${addr.id}/default`);
      await loadAddresses();
      toast.success('Default address updated');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to set default');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (addr) => {
    if (!window.confirm('Delete this address? This cannot be undone.')) return;
    setBusyId(addr.id);
    try {
      await axios.delete(`/addresses/${addr.id}`);
      await loadAddresses();
      toast.success('Address deleted');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to delete address');
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="profile-page-wrap">
        <header className="profile-page-header">
          <h1 className="profile-page-title">My Addresses</h1>
        </header>
        <div className="address-card">
          <Skeleton.Text lines={3} height={13} />
          <div style={{ height: 12 }} />
          <Skeleton height={36} width={160} radius={8} />
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page-wrap">
      <header className="profile-page-header addresses-header">
        <h1 className="profile-page-title">My Addresses</h1>
        {!formOpen && (
          <button onClick={openAddForm} className="address-add-btn">
            <Plus size={16} /> Add new address
          </button>
        )}
      </header>

      {addresses.length === 0 && !formOpen && (
        <div className="address-empty">
          <MapPin size={28} />
          <p>You have no saved addresses yet.</p>
          <button onClick={openAddForm} className="address-action-btn">
            <Plus size={16} /> Add your first address
          </button>
        </div>
      )}

      {!formOpen && addresses.length > 0 && (
        <div className="address-list">
          {addresses.map((addr) => (
            <div key={addr.id} className="address-card">
              {addr.isDefault && (
                <div className="address-default-badge"><Check size={14} /> Default</div>
              )}
              <div className="address-card-body">
                {addr.label && <span className="address-label-tag">{addr.label}</span>}
                <h3 className="address-name">{addr.fullName}</h3>
                <p className="address-phone">{addr.contactNumber || '—'}</p>
                <div className="address-location">
                  <MapPin size={16} />
                  <div>
                    <p>{addr.street || '—'}</p>
                    <p>{addr.barangay || '—'}</p>
                    <p>{addr.municipality?.name || '—'}, {addr.province || 'Oriental Mindoro'}</p>
                  </div>
                </div>
              </div>
              <div className="address-card-actions">
                {!addr.isDefault && (
                  <button
                    onClick={() => handleSetDefault(addr)}
                    disabled={busyId === addr.id}
                    className="address-action-btn"
                  >
                    <Star size={14} /> Set as default
                  </button>
                )}
                <button onClick={() => openEditForm(addr)} className="address-action-btn">
                  <Pencil size={14} /> Edit
                </button>
                <button
                  onClick={() => handleDelete(addr)}
                  disabled={busyId === addr.id}
                  className="address-action-btn address-action-btn-danger"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <form onSubmit={handleSave} className="address-edit-form">
          <div className="form-group">
            <label className="form-label">Label (optional)</label>
            <input
              type="text"
              name="label"
              value={formData.label}
              onChange={handleChange}
              className="form-input"
              placeholder="Home, Work, etc."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Recipient Name</label>
            <input
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              className={`form-input ${formErrors.fullName ? 'error' : ''}`}
              placeholder="Juan Dela Cruz"
            />
            {formErrors.fullName && <span className="form-error">{formErrors.fullName}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Contact Number</label>
            <input
              type="text"
              name="contactNumber"
              value={formData.contactNumber}
              onChange={handleChange}
              className={`form-input ${formErrors.contactNumber ? 'error' : ''}`}
              placeholder="09XXXXXXXXX"
            />
            {formErrors.contactNumber && <span className="form-error">{formErrors.contactNumber}</span>}
          </div>

          <PhAddressPicker
            value={formData}
            onChange={(next) => setFormData((prev) => ({ ...prev, ...next }))}
            dbMunicipalities={municipalities}
            errors={formErrors}
          />

          <div className="address-edit-actions">
            <button type="button" onClick={closeForm} className="btn-modal-cancel">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-modal-submit">
              {isSubmitting ? 'Saving...' : editingId ? 'Save Changes' : 'Add Address'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default Addresses;
