import React, { useEffect, useMemo, useState } from 'react';
import { X } from '@phosphor-icons/react';
import { useLocation } from 'react-router-dom';
import { completeGuide, shouldShowGuide } from '../../lib/sellerGuides';
import './SellerCenterGuide.css';

const GUIDES = {
  '/seller/products': [
    { target: '.seller-header-actions .btn-seller-primary', title: 'Create a product', text: 'Add a new listing with clear photos, pricing, stock, variations, and a return policy.' },
    { target: '.products-toolbar', title: 'Find and filter listings', text: 'Use search and filters to quickly manage a growing product catalog.' },
    { target: '.products-table', title: 'Manage product status', text: 'Review stock and listing status here. Products may be pending, approved, rejected, or archived.' },
  ],
  '/seller/products/new': [
    { target: '.pf-section', title: 'Build your listing', text: 'Go through the steps from top to bottom. Clear photos and a simple description help buyers choose.' },
    { target: '.pf-section--price', title: 'Price and stock', text: 'Keep price and stock current. Products with no stock are unavailable to buyers.' },
    { target: '.pf-footer', title: 'Save your product', text: 'Tap Add product when ready. New listings may need a quick review before buyers can see them.' },
  ],
  '/seller/orders': [
    { target: '.seller-tabs', title: 'Filter by order stage', text: 'Move between new, preparing, delivery, pickup, completed, and cancelled orders.' },
    { target: '.orders-list-card', title: 'Review order details', text: 'Open an order to check its buyer, products, payment, and fulfillment method.' },
    { target: '.status-dropdown-btn', title: 'Update fulfillment', text: 'Choose the next valid status here. Buyers are notified when their order progresses.' },
  ],
  '/seller/returns': [
    { target: '.seller-return-tabs', title: 'Track return stages', text: 'Start with Requested, then monitor items awaiting shipment, received returns, and refunds.' },
    { target: '.seller-return-list', title: 'Review buyer requests', text: 'Select a request to inspect its items, reason, notes, and requested amount.' },
    { target: '.seller-return-detail', title: 'Decide and refund carefully', text: 'Approve or reject requests, confirm returned items, and record the final refund reference.' },
  ],
  '/seller/messages': [
    { target: '.msgr-list-search', title: 'Find conversations', text: 'Search by buyer or store conversation to reach the right customer quickly.' },
    { target: '.msgr-scroll', title: 'Open a buyer conversation', text: 'Select a conversation to review the message history and any linked order context.' },
    { target: '.msgr-composer', title: 'Reply with context', text: 'Send clear updates and attach images when they help explain products, delivery, or returns.' },
  ],
  '/seller/store': [
    { target: '.store-form', title: 'Public store information', text: 'Your store name and description are visible to buyers. Keep them accurate and easy to understand.' },
    { target: '.store-branding-body', title: 'Store branding', text: 'Upload a clear logo and banner so buyers can recognize your storefront.' },
    { target: '.store-theme-body', title: 'Brand color', text: 'Choose an accessible accent color that keeps storefront text and actions readable.' },
    { target: '.store-preview-card', title: 'Preview your storefront', text: 'Use this link to check the buyer-facing store after saving changes.' },
  ],
  '/seller/fulfillment': [
    { target: '.sf-mode-grid', title: 'Choose fulfillment methods', text: 'Offer delivery, pickup, or both depending on how your store can serve buyers.' },
    { target: '.sf-picker-row', title: 'Set delivery coverage', text: 'Add municipalities and barangays you can serve, then configure the appropriate fee.' },
    { target: '.sf-payment-grid', title: 'Configure payments', text: 'Select the payment method and upload the correct payment QR image shown at checkout.' },
    { target: '.sf-footer-actions', title: 'Save fulfillment settings', text: 'Save after changing coverage, fees, pickup instructions, or payment information.' },
  ],
  '/seller/analytics': [
    { target: '.an-actions', title: 'Refresh or export', text: 'Refresh the latest figures or export your current analytics data for reporting.' },
    { target: '.an-kpi-grid', title: 'Performance overview', text: 'These cards summarize revenue, orders, average order value, and active products.' },
    { target: '.an-growth', title: 'Compare performance', text: 'Use the selected period to understand whether sales and orders are improving.' },
    { target: '.an-grid-2', title: 'Read the trends', text: 'Charts reveal revenue and order patterns. Use them to plan inventory and promotions.' },
  ],
  '/seller/finance': [
    { target: '.sd-stats--3', title: 'Understand your earnings', text: 'Completed-order earnings are separate from orders still in progress. Refunds can reduce final totals.' },
    { target: '.seller-table', title: 'Verify completed sales', text: 'Use this table to review the completed orders included in your earnings.' },
    { target: 'a[href="/seller/fulfillment"]', title: 'Keep payment details current', text: 'Update payment and fulfillment information before accepting new orders.' },
  ],
  '/seller/reviews': [
    { target: '.reviews-summary', title: 'Monitor buyer sentiment', text: 'Your average rating and review count help indicate overall customer satisfaction.' },
    { target: '.reviews-list', title: 'Read product feedback', text: 'Review comments for recurring product, packaging, or delivery concerns.' },
    { target: '.reviews-reply-trigger', title: 'Reply publicly', text: 'Seller replies are visible to buyers. Keep responses helpful, factual, and professional.' },
  ],
  '/seller/settings': [
    { target: '.store-danger-card', title: 'Destructive account actions', text: 'Deleting a shop affects listings and seller operations. Review the consequences before continuing.' },
    { target: '.settings-deletion-pending', title: 'Deletion pending', text: 'A pending deletion can be cancelled here before the scheduled removal date.' },
  ],
};

export default function SellerCenterGuide({ store, setStore }) {
  const location = useLocation();
  const steps = useMemo(() => GUIDES[location.pathname] || [], [location.pathname]);
  const guideKey = location.pathname;
  // A seller sent here by Shop setup (or any link to one card) came to do
  // one thing; the page tour waits for a later visit instead of pulling
  // them away from it.
  const focused = Boolean(location.hash) || Boolean(location.state?.fromSetup);
  const eligible = shouldShowGuide(store, guideKey) && !focused;
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [position, setPosition] = useState(null);

  useEffect(() => {
    setActive(false);
    setStepIndex(0);
    setPosition(null);
    if (!steps.length || !eligible) return undefined;
    const timer = window.setTimeout(() => setActive(true), 650);
    return () => window.clearTimeout(timer);
  }, [steps, guideKey, eligible]);

  const availableSteps = useMemo(
    () => steps.filter((step) => document.querySelector(step.target)),
    [steps, active],
  );
  const step = availableSteps[stepIndex];

  useEffect(() => {
    if (!active || !step) return undefined;
    const update = () => {
      const target = document.querySelector(step.target);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 24);
      const height = 180;
      const top = rect.bottom + 14 + height <= window.innerHeight
        ? rect.bottom + 14
        : Math.max(12, rect.top - height - 14);
      const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
      setPosition({ rect, top, left, width });
    };
    document.querySelector(step.target)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = window.setTimeout(update, 260);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [active, step]);

  const finish = () => {
    setActive(false);
    completeGuide(guideKey, setStore);
  };
  const next = () => stepIndex >= availableSteps.length - 1 ? finish() : setStepIndex((index) => index + 1);

  if (!active || !step || !position) return null;
  const { rect, top, left, width } = position;
  return (
    <div className="seller-guide" role="dialog" aria-modal="true" aria-labelledby="seller-guide-title">
      <div className="seller-guide-focus" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} />
      <section className="seller-guide-tip" style={{ top, left, width }}>
        <header><span>{stepIndex + 1} of {availableSteps.length}</span><button type="button" onClick={finish} aria-label="Close guide"><X size={16} /></button></header>
        <h2 id="seller-guide-title">{step.title}</h2>
        <p>{step.text}</p>
        <footer><button type="button" className="seller-guide-skip" onClick={finish}>Skip</button><button type="button" className="seller-guide-next" onClick={next} autoFocus>{stepIndex === availableSteps.length - 1 ? 'Finish' : 'Next'}</button></footer>
      </section>
    </div>
  );
}
