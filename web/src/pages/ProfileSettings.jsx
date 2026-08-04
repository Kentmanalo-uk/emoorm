import React, { useState } from 'react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';

const ProfileSettings = () => {
  const { user, updateUser } = useAuthStore();
  const [form, setForm] = useState({
    fullName: user?.fullName || '',
    phone: user?.phone || '',
  });
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await axios.put('/auth/profile', form);
      if (res.data && updateUser) updateUser({ ...user, ...res.data });
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-section">
      <h3 className="profile-section-title">Settings</h3>
      <form onSubmit={handleSubmit} className="profile-settings-form">
        <label className="profile-settings-field">
          <span>Full Name</span>
          <input
            name="fullName"
            value={form.fullName}
            onChange={handleChange}
            required
          />
        </label>
        <label className="profile-settings-field">
          <span>Phone</span>
          <input
            name="phone"
            value={form.phone}
            onChange={handleChange}
            placeholder="09xxxxxxxxx"
          />
        </label>
        <label className="profile-settings-field">
          <span>Email</span>
          <input value={user?.email || ''} disabled />
        </label>
        <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
};

export default ProfileSettings;
