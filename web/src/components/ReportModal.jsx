import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import './ReportModal.css';

const REPORT_REASONS = {
  PRODUCT: [
    'Counterfeit or fake product',
    'Prohibited / illegal item',
    'Misleading description',
    'Wrong item received',
    'Dangerous or unsafe product',
    'Other',
  ],
  SELLER: [
    'Fraud or scam',
    'Harassment or abusive behavior',
    'Selling prohibited items',
    'Non-delivery of items',
    'Impersonation',
    'Other',
  ],
};

export default function ReportModal({ type, productId, storeId, targetName, onClose }) {
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reasons = REPORT_REASONS[type] || REPORT_REASONS.PRODUCT;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason) { toast.error('Please select a reason'); return; }
    if (!description.trim()) { toast.error('Please describe the issue'); return; }

    setSubmitting(true);
    try {
      await axios.post('/reports', {
        type,
        productId: productId || undefined,
        storeId: storeId || undefined,
        reason,
        description: description.trim(),
      });
      toast.success('Report submitted. Our team will review it.');
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="report-overlay" onClick={onClose}>
      <div className="report-modal" onClick={(e) => e.stopPropagation()}>
        <div className="report-modal-header">
          <div className="report-modal-title">
            <AlertTriangle size={20} className="report-icon" />
            <h2>Report {type === 'SELLER' ? 'Seller' : 'Product'}</h2>
          </div>
          <button className="report-close" onClick={onClose}><X size={20} /></button>
        </div>

        {targetName && (
          <p className="report-target">Reporting: <strong>{targetName}</strong></p>
        )}

        <form onSubmit={handleSubmit}>
          <div className="report-field">
            <label>Reason for report</label>
            <select value={reason} onChange={(e) => setReason(e.target.value)} required>
              <option value="">Select a reason…</option>
              {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="report-field">
            <label>Additional details</label>
            <textarea
              rows={4}
              placeholder="Describe the issue in detail…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              required
            />
            <span className="report-char">{description.length}/2000</span>
          </div>

          <p className="report-disclaimer">
            False reports may result in account action. Our team will review this
            within 24–48 hours.
          </p>

          <div className="report-actions">
            <button type="button" className="report-btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="report-btn-submit" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
