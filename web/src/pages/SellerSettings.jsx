import React, { useEffect, useState } from 'react';
import { ShieldWarning as ShieldAlert, Trash as Trash2, Clock, ArrowCounterClockwise as RotateCcw } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import Skeleton from '../components/ui/Skeleton';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import './SellerDashboard.css';
import './SellerStore.css';
import './SellerSettings.css';

/**
 * Dedicated shop settings — account-level controls (not the public Shop Profile).
 * Currently: shop deletion with a 15-day cancellable grace period.
 */
export default function SellerSettings() {
  const [store, setStore] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadStore();
  }, []);

  const loadStore = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get('/stores/my/store');
      setStore(res.data);
    } catch {
      setStore(null);
    } finally {
      setIsLoading(false);
    }
  };

  const confirmRequestDeletion = async () => {
    setIsSubmitting(true);
    try {
      const res = await axios.delete(`/stores/${store.id}`);
      setStore(res.data);
      toast.success('Shop deletion scheduled. It is now hidden from buyers.');
    } catch (err) {
      toast.error(err.message || 'Could not schedule deletion');
    } finally {
      setIsSubmitting(false);
      setDeleteConfirm(false);
    }
  };

  const confirmCancelDeletion = async () => {
    setIsSubmitting(true);
    try {
      const res = await axios.post(`/stores/${store.id}/cancel-deletion`);
      setStore(res.data);
      toast.success('Deletion cancelled. Your shop is active again.');
    } catch (err) {
      toast.error(err.message || 'Could not cancel deletion');
    } finally {
      setIsSubmitting(false);
      setCancelConfirm(false);
    }
  };

  const pendingDeletion = !!store?.deletionRequestedAt;

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <div className="seller-header">
          <div>
            <h1>Shop Settings</h1>
            <p className="seller-welcome">
              Account-level shop controls — separate from your public Shop Profile
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="seller-card" style={{ padding: 20 }}>
            <Skeleton.Text lines={3} height={14} />
          </div>
        ) : !store ? (
          <div className="seller-card" style={{ padding: 20 }}>
            <p>You don't have a shop yet. Create one from Shop Profile first.</p>
          </div>
        ) : pendingDeletion ? (
          <div className="seller-card settings-deletion-pending">
            <div className="seller-card-header">
              <h2><Clock size={16} /> Shop Deletion Scheduled</h2>
            </div>
            <div className="settings-deletion-body">
              <p>
                Your shop <strong>{store.name}</strong> is hidden from buyers and scheduled for
                permanent deletion on{' '}
                <strong>
                  {new Date(store.deletionScheduledAt).toLocaleDateString('en-PH', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </strong>{' '}
                ({store.deletionDaysRemaining} day{store.deletionDaysRemaining === 1 ? '' : 's'} remaining).
              </p>
              <p className="settings-deletion-hint">
                Cancel anytime before then to keep your shop and make it visible to buyers again.
              </p>
              <button type="button" className="btn-seller-primary" onClick={() => setCancelConfirm(true)}>
                <RotateCcw size={15} /> Cancel Deletion
              </button>
            </div>
          </div>
        ) : (
          <div className="seller-card store-danger-card">
            <div className="seller-card-header">
              <h2><ShieldAlert size={16} /> Delete This Shop</h2>
            </div>
            <div className="store-danger-body">
              <div>
                <strong>Delete this shop</strong>
                <p>
                  Your shop will be hidden from buyers immediately. It stays recoverable for 15
                  days — after that it is permanently deleted. You can cancel anytime during
                  those 15 days from this page.
                </p>
              </div>
              <button
                type="button"
                className="btn-seller-outline btn-danger-outline"
                onClick={() => setDeleteConfirm(true)}
              >
                <Trash2 size={14} /> Delete Shop
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteConfirm}
        title={`Delete "${store?.name}"?`}
        message="Your shop will be hidden from buyers right away. It will be permanently deleted in 15 days unless you cancel before then."
        confirmLabel="Delete Shop"
        danger
        loading={isSubmitting}
        onConfirm={confirmRequestDeletion}
        onCancel={() => setDeleteConfirm(false)}
      />

      <ConfirmDialog
        open={cancelConfirm}
        title="Cancel shop deletion?"
        message="Your shop will immediately become active and visible to buyers again."
        confirmLabel="Cancel Deletion"
        loading={isSubmitting}
        onConfirm={confirmCancelDeletion}
        onCancel={() => setCancelConfirm(false)}
      />
    </div>
  );
}
