import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bell, Info } from '@phosphor-icons/react';
import Layout from '../components/layout/Layout';
import AdminLayout from '../components/admin/AdminLayout';
import axios from '../lib/axios';
import { notificationHref } from '../lib/notificationLink';
import './Notifications.css';

/**
 * A single notification, in full.
 *
 * Announcements are the reason this page exists: the list clips a long message
 * to a couple of lines and there is no order or conversation behind it to open,
 * so the notification itself is the destination.
 *
 * `admin` is set by the /admin/notifications/:id route. RoleGate confines admin
 * accounts to /admin/*, so their copy of this page has to live there or the
 * link would bounce them to the dashboard instead of opening what they clicked.
 */
export default function NotificationDetail({ admin = false }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [notification, setNotification] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await axios.get(`/notifications/${id}`);
        if (cancelled) return;
        const item = res.data;
        setNotification(item);

        // Opening it counts as reading it.
        if (item && !item.isRead) {
          axios.put(`/notifications/${id}/read`).catch(() => { /* not worth interrupting for */ });
        }
      } catch (err) {
        if (cancelled) return;
        setError(err?.response?.data?.message || 'This notification is no longer available.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [id]);

  // A notice that also points somewhere (a verification page, a store) offers
  // the jump rather than dead-ending here.
  const onwardKind = notification?.target?.kind;
  const onwardHref = onwardKind && onwardKind !== 'notification' && onwardKind !== 'admin-notification'
    ? notificationHref(notification)
    : null;

  const listHref = admin
    ? '/admin/notifications'
    : notification?.audience === 'SELLER'
      ? '/seller/notifications'
      : '/notifications';

  const body = (
    <>
      {!admin && (
        <div className="notif-breadcrumbs">
          <Link to="/">Home</Link><span>/</span>
          <Link to={listHref}>Notifications</Link><span>/</span>
          <span>Details</span>
        </div>
      )}

      <button className="notif-detail-back" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} /> Back
      </button>

      {isLoading ? (
        <div className="notif-loading">
          <div className="notif-skeleton" />
          <div className="notif-skeleton" />
        </div>
      ) : error ? (
        <div className="notif-empty">
          <Bell size={48} weight="fill" />
          <h2>Not available</h2>
          <p>{error}</p>
          <Link className="notif-show-all-btn" to={listHref}>Back to notifications</Link>
        </div>
      ) : notification ? (
        <article className="notif-detail-card">
          <div className="notif-detail-head">
            <span className="notif-detail-icon"><Info size={20} /></span>
            <div>
              <h1>{notification.title}</h1>
              <p className="notif-detail-meta">
                {new Date(notification.createdAt).toLocaleString('en-PH', {
                  dateStyle: 'long',
                  timeStyle: 'short',
                })}
              </p>
            </div>
          </div>

          <p className="notif-detail-body">{notification.message}</p>

          {onwardHref && (
            <Link className="notif-show-all-btn" to={onwardHref}>Open</Link>
          )}
        </article>
      ) : null}
    </>
  );

  if (admin) {
    return <AdminLayout>{body}</AdminLayout>;
  }

  return (
    <Layout>
      <div className="notif-page">
        <div className="notif-container">{body}</div>
      </div>
    </Layout>
  );
}
