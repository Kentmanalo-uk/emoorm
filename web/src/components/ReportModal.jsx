import React, { useState } from 'react';
import { X, Warning as AlertTriangle } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import './ReportModal.css';

/**
 * Reasons are sent as the API's enum value, not as the label.
 *
 * This modal used to post the label ("Counterfeit or fake product"), which the
 * API rejects with "Invalid report reason" — so every report filed from a
 * product or store page failed. The value is what travels; the label is only
 * ever shown.
 */
const REPORT_REASONS = {
  PRODUCT: [
    { value: 'COUNTERFEIT', label: 'Counterfeit or fake product' },
    { value: 'INAPPROPRIATE_CONTENT', label: 'Prohibited or illegal item' },
    { value: 'MISLEADING', label: 'Misleading description or photos' },
    { value: 'SPAM', label: 'Spam or duplicate listing' },
    { value: 'OTHER', label: 'Something else' },
  ],
  SELLER: [
    { value: 'FRAUD', label: 'Fraud or scam' },
    { value: 'ABUSIVE_BEHAVIOR', label: 'Harassment or abusive behaviour' },
    { value: 'INAPPROPRIATE_CONTENT', label: 'Selling prohibited items' },
    { value: 'MISLEADING', label: 'Item never arrived or was not as described' },
    { value: 'SPAM', label: 'Impersonation or spam' },
    { value: 'OTHER', label: 'Something else' },
  ],
  BUYER: [
    { value: 'NON_PAYMENT', label: 'Did not pay for the order' },
    { value: 'FAKE_ORDER', label: 'Fake or repeated bogus orders' },
    { value: 'ABUSIVE_BEHAVIOR', label: 'Harassment or abusive behaviour' },
    { value: 'FRAUD', label: 'Fraud or chargeback abuse' },
    { value: 'SPAM', label: 'Spam messages' },
    { value: 'OTHER', label: 'Something else' },
  ],
};

const HEADING = { PRODUCT: 'Report Product', SELLER: 'Report Seller', BUYER: 'Report Buyer' };

/**
 * Who reads it, so the reporter is not left wondering where it went.
 * Product and seller reports go to the municipality the shop trades in; a
 * buyer report goes to the buyer's own municipal admin, because that is the
 * admin who can act on the account.
 */
const DESTINATION = {
  PRODUCT: "This goes to the municipal admin for the shop's municipality.",
  SELLER: "This goes to the municipal admin for the shop's municipality.",
  BUYER: "This goes to the municipal admin for the buyer's municipality.",
};

export default function ReportModal({ type, productId, storeId, reportedBuyerId, targetName, onClose }) {
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
        reportedBuyerId: reportedBuyerId || undefined,
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
            <h2>{HEADING[type] || 'Report'}</h2>
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
              {reasons.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
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
            {DESTINATION[type] || DESTINATION.PRODUCT} You can follow it in{' '}
            <strong>My Reports</strong>. False reports may result in account action.
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
