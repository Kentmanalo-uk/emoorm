import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  CaretRight, User, Key, ShieldCheck, PaintBrush, Palette, Buildings, Bell, Globe, Gear, SignOut,
} from '@phosphor-icons/react';
import AdminLayout from '../components/admin/AdminLayout';
import { useAdminShell } from '../components/admin/adminShell';
import UserAvatar from '../components/ui/UserAvatar';
import AppLogo from '../components/AppLogo';
import useAuthStore from '../store/authStore';
import { usePhoneLayout } from '../hooks/useMobileNav';
import { resolveImg } from '../lib/media';
import { LANGUAGES, getCurrentLanguage, setLanguage } from '../lib/googleTranslate';
import './SellerApp.css';

/*
 * "Me" for admins on a phone (the tab bar's last tab), drawn like the seller
 * app's Me: who you are and what is waiting, then the account (profile,
 * password, two-factor, branding or municipality), notifications, language
 * and Sign out. The admin sections themselves are tool cards on Home.
 * On a computer the sidebar already lists all of this, so it goes to Home.
 */

function Row({ to, icon: Icon, label, badge = 0 }) {
  return (
    <Link to={to} className="sme-row">
      <span className="sme-row-icon"><Icon size={19} weight="fill" /></span>
      <span className="sme-row-label">{label}</span>
      {badge > 0 && <span className="sm-badge">{badge > 9 ? '9+' : badge}</span>}
      <CaretRight size={16} className="sh-chev" />
    </Link>
  );
}

function MenuBody() {
  const { user } = useAuthStore();
  const {
    waiting = {}, unreadCount = 0, messageUnread = 0, isSuperAdmin, roleLabel, centerTitle,
    municipalityName, municipalityLogo, requestLogout,
  } = useAdminShell();
  const [language, setLanguageState] = useState(getCurrentLanguage);
  const totalWaiting = Object.values(waiting || {}).reduce((sum, item) => sum + (Number(item?.count) || 0), 0);
  const name = user?.fullName || 'Admin';

  return (
    <div className="sme ame">
      <header className="sme-head">
        <h1 className="sme-title">Me</h1>
        <div className="sh-actions">
          <Link to="/admin/settings" className="sh-icon" aria-label="Settings" title="Settings">
            <Gear size={19} />
          </Link>
        </div>
      </header>

      <div className="sh-body">
        {/* Who you are: tap for your profile. */}
        <section className="sh-card sme-card">
          <Link to="/admin/settings?tab=profile" className="sme-id" aria-label="Your profile">
            <span className="sme-avatar">
              {user?.profilePhoto
                ? <UserAvatar src={user.profilePhoto} name={name.charAt(0)} alt="" />
                : !isSuperAdmin && municipalityLogo
                  ? <img src={resolveImg(municipalityLogo)} alt="" />
                  : isSuperAdmin ? <AppLogo /> : name.charAt(0).toUpperCase()}
            </span>
            <span className="sme-id-text">
              <strong>{name}</strong>
              <span>{isSuperAdmin ? roleLabel : `${roleLabel} · ${municipalityName || centerTitle}`}</span>
              {user?.email && <span>{user.email}</span>}
            </span>
            <CaretRight size={18} className="sh-chev" />
          </Link>
          <div className="sme-stats">
            <Link to="/admin">
              <strong>{totalWaiting}</strong>
              <span>Waiting</span>
            </Link>
            <Link to="/admin/messages">
              <strong>{messageUnread}</strong>
              <span>Messages</span>
            </Link>
            <Link to="/admin/notifications">
              <strong>{unreadCount}</strong>
              <span>Alerts</span>
            </Link>
          </div>
        </section>

        <section className="sh-card sme-list">
          <h2>Account</h2>
          <Row to="/admin/settings?tab=profile" icon={User} label="Profile" />
          <Row to="/admin/settings?tab=password" icon={Key} label="Password" />
          <Row to="/admin/settings?tab=security" icon={ShieldCheck} label="Two-factor sign-in" />
          <Row to="/admin/notifications" icon={Bell} label="Notifications" badge={unreadCount} />
          {isSuperAdmin ? (
            <>
              <Row to="/admin/settings?tab=branding" icon={PaintBrush} label="Branding" />
              <Row to="/admin/settings?tab=appearance" icon={Palette} label="Theme & colours" />
            </>
          ) : (
            <Row to="/admin/settings?tab=municipality" icon={Buildings} label="Municipality" />
          )}
          <label className="sme-row sm-lang notranslate" translate="no">
            <span className="sme-row-icon"><Globe size={19} weight="fill" /></span>
            <span className="sme-row-label">Language</span>
            <select
              value={language}
              onChange={(e) => {
                setLanguageState(e.target.value);
                setLanguage(e.target.value);
              }}
              aria-label="Language"
            >
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            <CaretRight size={16} className="sh-chev" />
          </label>
        </section>

        <button type="button" className="sme-logout" onClick={requestLogout}>
          <SignOut size={18} weight="bold" /> Sign out
        </button>
      </div>
    </div>
  );
}

export default function AdminMenu() {
  const isPhone = usePhoneLayout();
  if (!isPhone) return <Navigate to="/admin" replace />;
  return (
    <AdminLayout>
      <MenuBody />
    </AdminLayout>
  );
}
