import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Toaster, resolveValue, toast, useToasterStore } from 'react-hot-toast';
import {
  ArrowCounterClockwise, Bell, ChatCircleDots, ChatsCircle, ChatText, CheckCircle, Copy, FileArrowDown,
  Flag, GearSix, Headset, Heart, IdentificationCard, ImageSquare, Info, LockKey, MapPin, Megaphone,
  Package, Prohibit, Receipt, ShoppingCart, SpinnerGap, Star, Storefront, Tag, Ticket, UserCircle,
  UserPlus, WarningCircle, X,
} from '@phosphor-icons/react';
import { resolveImg } from '../../lib/media';
import { playSound } from '../../lib/uiSound';
import './AppToaster.css';

/**
 * Pop-ups, iPhone style: a frosted banner that glides down from the top.
 * On the left, what it is about (a report's flag, an order's box…) or, for a
 * message, the sender's picture with a small message badge; beside it a
 * small line saying what kind of news it is, then the news itself in bold
 * and any detail under it. Pop-ups that lead somewhere open it when tapped
 * (the new notifications from NotificationWatcher, and toasts given an
 * `href`). Swiped up, a banner goes away. Only one shows at a time.
 */

/** What an action's message is about, from its words: the icon and the small label. */
const CONTEXTS = [
  { test: /\breport/i, Icon: Flag, label: 'Report', tone: 'orange' },
  { test: /\breview/i, Icon: Star, label: 'Review', tone: 'amber' },
  { test: /\bwishlist/i, Icon: Heart, label: 'Wishlist', tone: 'pink' },
  { test: /\bcart\b/i, Icon: ShoppingCart, label: 'Cart', tone: 'green' },
  { test: /\breturn\b|\brefund/i, Icon: ArrowCounterClockwise, label: 'Return', tone: 'amber' },
  { test: /\border/i, Icon: Package, label: 'Order', tone: 'green' },
  { test: /\bvoucher/i, Icon: Ticket, label: 'Voucher', tone: 'pink' },
  { test: /\bpayment|\bproof\b|\bgcash|\bqr\b/i, Icon: Receipt, label: 'Payment', tone: 'green' },
  { test: /\bmessage|\breply|\bthread|\bchat\b/i, Icon: ChatCircleDots, label: 'Message', tone: 'blue' },
  { test: /\bsupport|\bcase\b/i, Icon: Headset, label: 'Support', tone: 'blue' },
  { test: /\bfeedback/i, Icon: ChatText, label: 'Feedback', tone: 'blue' },
  { test: /\bpassword|\bmfa\b|\bbackup code|\bsigned (in|out)|\blog(ged)? ?(in|out)/i, Icon: LockKey, label: 'Security', tone: 'slate' },
  { test: /\bverif|\bidentity/i, Icon: IdentificationCard, label: 'Verification', tone: 'green' },
  { test: /\baddress/i, Icon: MapPin, label: 'Address', tone: 'green' },
  { test: /\bphoto|\bimage|\blogo|\bbanner|\bupload/i, Icon: ImageSquare, label: 'Upload', tone: 'blue' },
  { test: /\bfollow/i, Icon: UserPlus, label: 'Following', tone: 'pink' },
  { test: /\bproduct/i, Icon: Tag, label: 'Product', tone: 'green' },
  { test: /\bstore\b|\bshop\b|\bseller/i, Icon: Storefront, label: 'Shop', tone: 'green' },
  { test: /\bprofile|\baccount/i, Icon: UserCircle, label: 'Account', tone: 'green' },
  { test: /\bcopied|\bcopy\b/i, Icon: Copy, label: 'Copied', tone: 'slate' },
  { test: /\bexport/i, Icon: FileArrowDown, label: 'Export', tone: 'blue' },
  { test: /\bnotification/i, Icon: Bell, label: 'Notifications', tone: 'green' },
  { test: /\bsetting|\bsaved\b|\btheme|\bpalette/i, Icon: GearSix, label: 'Settings', tone: 'slate' },
];

const BY_TYPE = {
  success: { Icon: CheckCircle, label: 'Done', tone: 'green' },
  error: { Icon: WarningCircle, label: 'Needs attention', tone: 'red' },
  loading: { Icon: SpinnerGap, label: 'Working on it', tone: 'blue' },
  blank: { Icon: Info, label: 'Notice', tone: 'green' },
  custom: { Icon: Info, label: 'Notice', tone: 'green' },
};

/** New notifications, by type: the icon and the small label. */
const NOTIFICATION_LOOK = {
  ORDER_RECEIVED: { Icon: Package, label: 'New order', tone: 'green' },
  ORDER_CONFIRMED: { Icon: Package, label: 'Order', tone: 'green' },
  ORDER_READY: { Icon: Package, label: 'Order', tone: 'green' },
  ORDER_COMPLETED: { Icon: CheckCircle, label: 'Order', tone: 'green' },
  ORDER_CANCELLED: { Icon: Package, label: 'Order', tone: 'red' },
  PRODUCT_APPROVED: { Icon: Tag, label: 'Product', tone: 'green' },
  PRODUCT_SUSPENDED: { Icon: Prohibit, label: 'Product', tone: 'red' },
  SELLER_APPROVED: { Icon: Storefront, label: 'Shop', tone: 'green' },
  SELLER_SUSPENDED: { Icon: Storefront, label: 'Shop', tone: 'red' },
  REPORT_SUBMITTED: { Icon: Flag, label: 'Report', tone: 'orange' },
  REPORT_RESOLVED: { Icon: Flag, label: 'Report', tone: 'green' },
  SYSTEM_ANNOUNCEMENT: { Icon: Megaphone, label: 'Announcement', tone: 'purple' },
  STORE_NEW_PRODUCT: { Icon: Tag, label: 'New product', tone: 'green' },
  STORE_PROMOTION: { Icon: Ticket, label: 'Promotion', tone: 'pink' },
  STORE_ANNOUNCEMENT: { Icon: Megaphone, label: 'Shop news', tone: 'purple' },
  RETURN_REQUESTED: { Icon: ArrowCounterClockwise, label: 'Return', tone: 'amber' },
  RETURN_APPROVED: { Icon: ArrowCounterClockwise, label: 'Return', tone: 'green' },
  RETURN_REJECTED: { Icon: ArrowCounterClockwise, label: 'Return', tone: 'red' },
  RETURN_AWAITING_SHIPMENT: { Icon: ArrowCounterClockwise, label: 'Return', tone: 'amber' },
  RETURN_RECEIVED: { Icon: ArrowCounterClockwise, label: 'Return', tone: 'amber' },
  RETURN_REFUNDED: { Icon: ArrowCounterClockwise, label: 'Return', tone: 'green' },
  RETURN_CANCELLED: { Icon: ArrowCounterClockwise, label: 'Return', tone: 'slate' },
  RETURN_CLOSED: { Icon: ArrowCounterClockwise, label: 'Return', tone: 'slate' },
  SUPPORT_MESSAGE: { Icon: Headset, label: 'Support', tone: 'blue' },
  SUPPORT_RESOLVED: { Icon: Headset, label: 'Support', tone: 'green' },
  ADMIN_MESSAGE: { Icon: ChatsCircle, label: 'Message', tone: 'blue' },
  STORE_MESSAGE: { Icon: ChatCircleDots, label: 'Message', tone: 'blue' },
  SELLER_APPLICATION_SUBMITTED: { Icon: Storefront, label: 'Seller application', tone: 'blue' },
  ADMIN_ALERT: { Icon: WarningCircle, label: 'Alert', tone: 'red' },
};

/** The message as text, or the type's stand-in when it is not text. */
const messageOf = (item) => {
  const resolved = resolveValue(item.message, item);
  return typeof resolved === 'string' ? resolved : '';
};

/** "Report submitted. Our team will review it." → the first sentence in bold, the rest under it. */
const splitMessage = (text) => {
  const match = /^(.+?[.!?])\s+(\S[\s\S]*)$/.exec(text);
  if (!match) return { title: text.replace(/\.$/, ''), detail: '' };
  return { title: match[1].replace(/\.$/, ''), detail: match[2] };
};

/** The sound a pop-up makes as it appears (none while loading). */
const soundOf = (item) => {
  if (item.type === 'loading') return null;
  if (item.type === 'success') return 'success';
  if (item.type === 'error') return 'error';
  return 'info';
};

const initialsOf = (name) => String(name || '?').trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('')
  .toUpperCase();

/** A message's sender: their picture (or initials) with a small message badge. */
function SenderAvatar({ name, photo, BadgeIcon }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="app-toast-avatar" aria-hidden="true">
      {photo && !broken
        ? <img src={resolveImg(photo)} alt="" onError={() => setBroken(true)} />
        : <span className="app-toast-initials">{initialsOf(name)}</span>}
      <span className="app-toast-avatar-badge">
        <BadgeIcon size={11} weight="fill" />
      </span>
    </span>
  );
}

/**
 * One banner. The outer box glides in and out; the card inside follows a
 * finger swiping it up, and goes when swiped far enough.
 */
function Banner({
  item, visual, label, tone, title, detail, more = 0, href, onOpen, role = 'status',
}) {
  const navigate = useNavigate();
  const [drag, setDrag] = useState(0);
  const start = useRef(null);
  const moved = useRef(false);

  const onPointerDown = (event) => {
    if (event.target.closest('.app-toast-close')) return;
    start.current = event.clientY;
    moved.current = false;
  };
  const onPointerMove = (event) => {
    if (start.current === null) return;
    const dy = Math.min(0, event.clientY - start.current);
    if (dy < -4 && !moved.current) {
      moved.current = true;
      // A swipe has begun: keep following the finger even off the card.
      // (Not before: a plain tap must stay a click on the banner.)
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    setDrag(dy);
  };
  const onPointerUp = () => {
    if (start.current === null) return;
    start.current = null;
    if (drag < -28) toast.dismiss(item.id);
    setDrag(0);
  };
  const open = () => {
    if (moved.current || !href) return;
    onOpen?.();
    toast.dismiss(item.id);
    navigate(href);
  };

  const Body = href ? 'button' : 'div';
  return (
    <div
      className={`app-toast app-toast--${item.type} is-${tone} ${item.visible ? 'is-visible' : 'is-hidden'}`}
      role={role}
    >
      <div
        className={`app-toast-card${href ? ' is-link' : ''}${drag ? ' is-dragging' : ''}`}
        style={drag ? { transform: `translateY(${drag}px)`, opacity: Math.max(0.35, 1 + drag / 140) } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <Body
          className="app-toast-body"
          {...(href ? { type: 'button', onClick: open, 'aria-label': `${title}. Open` } : {})}
        >
          {visual}
          <span className="app-toast-text">
            <span className="app-toast-top">
              <span className="app-toast-label">{label}</span>
              <span className="app-toast-time">{more > 0 ? `now · ${more} more` : 'now'}</span>
            </span>
            <strong className="app-toast-title">{title}</strong>
            {detail && <span className="app-toast-detail">{detail}</span>}
          </span>
        </Body>
        <button
          type="button"
          className="app-toast-close"
          onClick={() => toast.dismiss(item.id)}
          aria-label="Dismiss"
        >
          <X size={12} weight="bold" />
        </button>
      </div>
    </div>
  );
}

function AppToast({ item }) {
  // A new notification (NotificationWatcher): what it is, from whom, where it leads.
  if (item.notification) {
    const n = item.notification;
    const look = NOTIFICATION_LOOK[n.type] || { Icon: Bell, label: 'Notification', tone: 'green' };
    const sender = n.sender;
    const visual = sender
      ? <SenderAvatar name={sender.name} photo={sender.photo} BadgeIcon={look.Icon} />
      : (
        <span className={`app-toast-icon is-${look.tone}`} aria-hidden="true">
          <look.Icon size={21} weight="fill" />
        </span>
      );
    return (
      <Banner
        item={item}
        visual={visual}
        label={look.label}
        tone={look.tone}
        title={sender ? sender.name : n.title}
        detail={n.message}
        more={n.more}
        href={n.href}
        onOpen={n.onOpen}
      />
    );
  }

  const message = messageOf(item);
  const context = CONTEXTS.find(({ test }) => test.test(message));
  const lower = message.toLowerCase();

  // Added to cart / wishlist: a dark frosted box in the middle, like the
  // iPhone's own confirmations.
  const isCart = lower.includes('cart');
  const isWishlist = lower.includes('wishlist');
  if (item.type === 'success' && (isCart || isWishlist) && !item.href) {
    const CommerceIcon = isCart ? ShoppingCart : Heart;
    const commerceTitle = isCart
      ? (lower.includes('removed') ? 'Removed from cart' : 'Added to cart')
      : (lower.includes('removed') || lower.includes('cleared') ? 'Wishlist updated' : 'Added to wishlist');
    return (
      <div className={`app-toast-commerce ${item.visible ? 'is-visible' : 'is-hidden'}`} role="status">
        <CommerceIcon size={38} weight={isWishlist ? 'fill' : 'regular'} aria-hidden="true" />
        <strong>{commerceTitle}</strong>
        <span>{message}</span>
      </div>
    );
  }

  const base = BY_TYPE[item.type] || BY_TYPE.blank;
  // What it is about, from its words; a problem keeps the warning sign.
  const look = item.type === 'error' || item.type === 'loading'
    ? { ...base, label: context?.label || base.label }
    : { ...base, ...(context || {}) };
  const { title, detail } = splitMessage(message || base.label);
  const Icon = look.Icon;

  return (
    <Banner
      item={item}
      visual={(
        <span className={`app-toast-icon is-${look.tone}`} aria-hidden="true">
          <Icon size={21} weight={item.type === 'loading' ? 'bold' : 'fill'} />
        </span>
      )}
      label={look.label}
      tone={look.tone}
      title={title}
      detail={detail}
      href={item.href}
      role={item.type === 'error' ? 'alert' : 'status'}
    />
  );
}

export default function AppToaster() {
  const { toasts } = useToasterStore();
  // Each pop-up chimes once as it appears, and again only when a "loading"
  // one turns into its result.
  const chimed = useRef(new Set());

  useEffect(() => {
    const visible = toasts
      .filter((item) => item.visible)
      .sort((first, second) => (second.createdAt || 0) - (first.createdAt || 0));
    visible.slice(1).forEach((item) => toast.dismiss(item.id));

    const newest = visible[0];
    const sound = newest && soundOf(newest);
    if (sound && !chimed.current.has(`${newest.id}:${newest.type}`)) {
      chimed.current.add(`${newest.id}:${newest.type}`);
      playSound(sound);
    }
    // Forget pop-ups that are gone.
    const live = new Set(toasts.map((item) => item.id));
    for (const key of chimed.current) {
      if (!live.has(key.slice(0, key.lastIndexOf(':')))) chimed.current.delete(key);
    }
  }, [toasts]);

  return (
    <Toaster
      position="top-center"
      gutter={0}
      containerStyle={{ top: 'calc(10px + env(safe-area-inset-top, 0px))' }}
      toastOptions={{
        duration: 3800,
        style: {
          padding: 0,
          margin: 0,
          background: 'transparent',
          boxShadow: 'none',
          maxWidth: 'none',
        },
      }}
    >
      {(item) => <AppToast item={item} />}
    </Toaster>
  );
}
