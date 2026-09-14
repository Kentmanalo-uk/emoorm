import React, { useEffect } from 'react';
import { Toaster, resolveValue, toast, useToasterStore } from 'react-hot-toast';
import {
  CheckCircle,
  Info,
  SpinnerGap,
  WarningCircle,
  ShoppingCart,
  Heart,
  X,
} from '@phosphor-icons/react';
import './AppToaster.css';

const TOAST_META = {
  success: {
    title: 'Success',
    description: 'Your action was completed successfully.',
    Icon: CheckCircle,
  },
  error: {
    title: 'Something needs attention',
    description: 'Please review the details and try again.',
    Icon: WarningCircle,
  },
  loading: {
    title: 'Working on it',
    description: 'Please wait while this action is completed.',
    Icon: SpinnerGap,
  },
  blank: {
    title: 'Notice',
    description: 'Here is an update from Emoorm.',
    Icon: Info,
  },
  custom: {
    title: 'Notice',
    description: 'Here is an update from Emoorm.',
    Icon: Info,
  },
};

function AppToast({ item }) {
  const meta = TOAST_META[item.type] || TOAST_META.blank;
  const Icon = meta.Icon;
  const resolvedMessage = resolveValue(item.message, item);
  const message = typeof resolvedMessage === 'string' ? resolvedMessage : meta.description;
  const normalizedMessage = message.toLowerCase();
  const isCart = normalizedMessage.includes('cart');
  const isWishlist = normalizedMessage.includes('wishlist');
  const isCommerce = item.type === 'success' && (isCart || isWishlist);
  const CommerceIcon = isCart ? ShoppingCart : Heart;
  const commerceTitle = isCart
    ? (normalizedMessage.includes('removed') ? 'Removed from cart' : 'Added to cart')
    : (normalizedMessage.includes('removed') || normalizedMessage.includes('cleared') ? 'Wishlist updated' : 'Added to wishlist');

  if (isCommerce) {
    return (
      <div
        className={`app-toast-commerce ${item.visible ? 'is-visible' : 'is-hidden'}`}
        role="status"
      >
        <CommerceIcon size={38} weight={isWishlist ? 'fill' : 'regular'} aria-hidden="true" />
        <strong>{commerceTitle}</strong>
        <span>{message}</span>
      </div>
    );
  }

  return (
    <div
      className={`app-toast app-toast--${item.type} ${item.visible ? 'is-visible' : 'is-hidden'}`}
      role={item.type === 'error' ? 'alert' : 'status'}
    >
      <span className="app-toast-icon" aria-hidden="true">
        <Icon size={18} weight={item.type === 'loading' ? 'regular' : 'fill'} />
      </span>
      <span className="app-toast-message">{message}</span>
      <button
        type="button"
        className="app-toast-close"
        onClick={() => toast.dismiss(item.id)}
        aria-label="Dismiss notification"
      >
        <X size={13} />
      </button>
    </div>
  );
}

export default function AppToaster() {
  const { toasts } = useToasterStore();

  useEffect(() => {
    const visible = toasts
      .filter((item) => item.visible)
      .sort((first, second) => (second.createdAt || 0) - (first.createdAt || 0));
    visible.slice(1).forEach((item) => toast.dismiss(item.id));
  }, [toasts]);

  return (
    <Toaster
      position="top-center"
      gutter={0}
      containerStyle={{ top: 18 }}
      toastOptions={{
        duration: 3600,
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
