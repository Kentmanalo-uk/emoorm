import { useState, useEffect } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import {
  Eye, CheckCircle, XCircle, Clock, Package, Truck, FileText, Storefront as StoreIcon, MagnifyingGlass, X, Flag, SlidersHorizontal,
  Printer, Phone, ChatCircleDots, QrCode,
} from '@phosphor-icons/react';
import { usePhoneLayout } from '../hooks/useMobileNav';
import useFocusTrap from '../hooks/useFocusTrap';
import { confirmAction } from '../lib/confirm';
import LoadFailed from '../components/ui/LoadFailed';
import { printPackingSlips } from '../components/orders/packingSlip';
import { peso } from '../lib/format';
import PhoneSheet from '../components/seller/PhoneSheet';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import Skeleton from '../components/ui/Skeleton';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { resolveImg } from '../lib/media';
import { lineImage } from '../lib/variationImage';
import EmptyArt from '../components/ui/EmptyArt';
import SellerPageHead from '../components/seller/SellerPageHead';
import ReportModal from '../components/ReportModal';
import './SellerDashboard.css';
import './SellerOrders.css';
import ProofPhotoSheet, { OrderProof } from '../components/orders/ProofPhotoSheet';
import ShipOrderSheet from '../components/orders/ShipOrderSheet';
import CourierTracking from '../components/orders/CourierTracking';
import {
  SELLER_TABS, sellerTabFrom, sellerTabCount, sellerTabOf, sellerNext, statusLabel, payLabel,
} from '../lib/orderProgress';
import '../components/orders/OrderStatusPanel.css';
import Spinner from '../components/ui/Spinner';
import { readCache, writeCache } from '../lib/pageCache';
import { momentLabel, spanLabel } from '../lib/availability';
import TimeLeft from '../components/ui/TimeLeft';
import {
  etaLabel, hasPaluto, lineKind, lineNote, countLabel,
} from '../lib/orderLines';
import Select from '../components/ui/Select';
import SellerRiderPanel from '../components/orders/SellerRiderPanel';
import RiderActionSheet from '../components/orders/RiderActionSheet';
import {
  carriedFeeLines, fallbackLine, isRiderOrder, orderPromo, refundAmount, refundLine, riderFeeNote, riderNextAction, riderOpen,
  riderReturning, riderStatus, useMoormove,
} from '../lib/moormove';
import { distanceNote } from '../lib/deliveryDistance';

// Available Today orders carry a time to confirm by (respondBy); unconfirmed
// by then, they cancel on their own.
const TodayTag = ({ order }) => {
  if (!order?.respondBy) return null;
  const waiting = order.status === 'PENDING';
  return (
    <div className="so-today">
      <span className="so-today-badge">Today</span>
      {waiting
        ? <TimeLeft until={order.respondBy} prefix="Confirm in" className="so-today-due" />
        : order.etaFrom && !['CANCELLED', 'DELIVERED', 'COMPLETED'].includes(order.status) && (
          <span className="so-today-ready">Ready {spanLabel(order.etaFrom, order.etaTo || order.etaFrom)}</span>
        )}
    </div>
  );
};

// Paluto is cooked after the order: when the buyer expects it.
const cookingFor = (order) => !order?.respondBy && order?.etaFrom && hasPaluto(order.items)
  && !['CANCELLED', 'DELIVERED', 'COMPLETED', 'PICKED_UP'].includes(order.status);
const CookTag = ({ order }) => (cookingFor(order) ? (
  <div className="so-today">
    <span className="so-today-badge so-cook-badge">Paluto</span>
    <span className="so-today-ready">Ready {etaLabel(order)}</span>
  </div>
) : null);

// "×2", or "2 heads" for animals.
const qtyLabel = (item) => (lineKind(item) === 'LIVESTOCK' ? countLabel(item) : `×${item.quantity}`);

// How many orders a tab holds (open steps only; not All, Completed, Cancelled).
const tabCount = (t, byStatus) => (t.key === 'all' || t.final ? 0 : sellerTabCount(t, byStatus));

// Every status but Cancelled: a payment to check on an order still going.
const OPEN_STATUSES = 'PENDING,CONFIRMED,PREPARING,TO_SHIP,READY,OUT_FOR_DELIVERY,SHIPPED,DELIVERED,READY_FOR_PICKUP,PICKED_UP,COMPLETED';

// "Payment to check": a buyer sent a payment proof the shop hasn't checked.
// Its own tab beside New on computers, a chip on phones.
const PAYMENT_TAB = { key: 'payment', label: 'Payment to check' };

// Computers: every status tab, with Payment to check after New.
const DESKTOP_TABS = [SELLER_TABS[0], SELLER_TABS[1], PAYMENT_TAB, ...SELLER_TABS.slice(2)];

// Phones: fewer, wider steps (the server's order stages), so the row of
// chips fits and each chip is one job.
const PHONE_TABS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'To confirm' },
  PAYMENT_TAB,
  { key: 'to_ship', label: 'To pack' },
  { key: 'shipping', label: 'On the way' },
  { key: 'completed', label: 'Done', final: true },
  { key: 'cancelled', label: 'Cancelled', final: true },
];
const PHONE_KEYS = new Set(PHONE_TABS.map((t) => t.key));

// A computer tab as the phone step it belongs to (and back), so a link or
// a resize lands on the matching tab.
const DESKTOP_TO_PHONE = {
  PENDING: 'new', CONFIRMED: 'to_ship', TO_SHIP: 'to_ship', SHIPPED: 'shipping', OUT_FOR_DELIVERY: 'shipping',
  READY_FOR_PICKUP: 'shipping', DELIVERED: 'shipping', COMPLETED: 'completed', CANCELLED: 'cancelled',
};
const PHONE_TO_DESKTOP = {
  new: 'PENDING', to_ship: 'to_ship', shipping: 'SHIPPED', completed: 'COMPLETED', cancelled: 'CANCELLED',
};

/** The tab a link names (?status=…), for this layout. */
const tabFromLink = (value, phone) => {
  const v = String(value || '');
  if (v === 'payment') return 'payment';
  if (phone) {
    if (PHONE_KEYS.has(v)) return v;
    return DESKTOP_TO_PHONE[sellerTabFrom(v)] || 'all';
  }
  // "To pack" (from the dashboard) spans Confirmed and To ship: shown as a
  // tab of its own while it is open.
  if (v === 'to_ship') return 'to_ship';
  return sellerTabFrom(v);
};

/** The same tab after the layout changed between phone and computer. */
const tabForLayout = (key, phone) => {
  if (key === 'all' || key === 'payment') return key;
  if (phone) return PHONE_KEYS.has(key) ? key : (DESKTOP_TO_PHONE[key] || 'all');
  return PHONE_KEYS.has(key) ? (PHONE_TO_DESKTOP[key] || 'all') : key;
};

/** What GET /orders/store/orders is asked for a tab. */
const tabQuery = (key) => {
  if (key === 'all') return {};
  if (key === 'payment') return { status: OPEN_STATUSES, paymentStatus: 'PENDING_VERIFICATION' };
  if (PHONE_KEYS.has(key)) return { stage: key };
  return { status: SELLER_TABS.find((t) => t.key === key)?.status || key };
};

/** When an order must be confirmed by, or null (Available today or the usual window). */
const confirmBy = (order) => {
  if (order?.status !== 'PENDING') return null;
  const at = order.respondBy || (order.deadline?.kind === 'confirm' ? order.deadline.at : null);
  return at ? new Date(at) : null;
};

// New orders that cancel on their own first, so none runs out unseen.
const soonestFirst = (list) => [...list].sort((a, b) => {
  const da = confirmBy(a)?.getTime() ?? Infinity;
  const db = confirmBy(b)?.getTime() ?? Infinity;
  return da - db;
});

const proofToCheck = (order) => order?.paymentStatus === 'PENDING_VERIFICATION' && order?.status !== 'CANCELLED';

// The usual confirm window (not Available today, which has its own tag).
const ConfirmByTag = ({ order }) => {
  const at = !order?.respondBy && confirmBy(order);
  if (!at) return null;
  return (
    <div className="so-confirm-by">
      <TimeLeft until={at} prefix="Confirm in" className="so-today-due" />
      <span>or it cancels</span>
    </div>
  );
};

// A phone number as a link that dials it.
const telHref = (number) => `tel:${String(number || '').replace(/[^\d+]/g, '')}`;

// The status words are the tabs' (lib/orderProgress statusLabel); a new order is "New".
const STATUS_LOOK = {
  PENDING: { cls: 'status-pending', icon: <Clock size={13} /> },
  CONFIRMED: { cls: 'status-confirmed', icon: <CheckCircle size={13} /> },
  PREPARING: { cls: 'status-preparing', icon: <Package size={13} /> },
  TO_SHIP: { cls: 'status-preparing', icon: <Package size={13} /> },
  OUT_FOR_DELIVERY: { cls: 'status-ready', icon: <Truck size={13} /> },
  SHIPPED: { cls: 'status-ready', icon: <Truck size={13} /> },
  DELIVERED: { cls: 'status-completed', icon: <CheckCircle size={13} /> },
  READY: { cls: 'status-ready', icon: <Truck size={13} /> },
  READY_FOR_PICKUP: { cls: 'status-ready', icon: <StoreIcon size={13} /> },
  PICKED_UP: { cls: 'status-completed', icon: <CheckCircle size={13} /> },
  COMPLETED: { cls: 'status-completed', icon: <CheckCircle size={13} /> },
  CANCELLED: { cls: 'status-cancelled', icon: <XCircle size={13} /> },
};
const statusOf = (status, fulfillmentMethod) => ({
  cls: '',
  ...STATUS_LOOK[status],
  label: status === 'PENDING' ? 'New' : statusLabel(status, fulfillmentMethod),
});

// The one next step for each status, within the backend's transitions
// (order.service.js updateOrderStatus). Delivery orders the buyer sent with a
// courier are shipped with it; the rest the seller delivers. Delivered and
// picked-up orders wait for the buyer (or complete on their own). READY is an
// older status: it is handed over like the newer ones, never completed
// straight away (a courier parcel is marked To ship first, then shipped).
const NEXT_STEP = {
  DELIVERY: {
    PENDING: 'CONFIRMED',
    CONFIRMED: 'TO_SHIP',
    PREPARING: 'TO_SHIP',
    TO_SHIP: (o) => (o.courierId ? 'SHIPPED' : 'OUT_FOR_DELIVERY'),
    OUT_FOR_DELIVERY: 'DELIVERED',
    READY: (o) => (o.courierId ? 'TO_SHIP' : 'OUT_FOR_DELIVERY'),
  },
  PICKUP: {
    PENDING: 'CONFIRMED',
    CONFIRMED: 'READY_FOR_PICKUP',
    PREPARING: 'READY_FOR_PICKUP',
    READY_FOR_PICKUP: 'PICKED_UP',
    READY: 'PICKED_UP',
  },
};
const CANCELLABLE = ['PENDING', 'CONFIRMED', 'PREPARING', 'TO_SHIP', 'OUT_FOR_DELIVERY', 'READY_FOR_PICKUP', 'READY'];

const PAYMENT_LABELS = {
  PENDING: { label: 'Unpaid', cls: 'status-pending' },
  PENDING_VERIFICATION: { label: 'Payment to verify', cls: 'status-pending' },
  PAID: { label: 'Paid', cls: 'status-completed' },
  FAILED: { label: 'Proof rejected — awaiting resubmission', cls: 'status-cancelled' },
  EXPIRED: { label: 'Payment expired', cls: 'status-cancelled' },
  REFUNDED: { label: 'Refunded', cls: 'status-cancelled' },
  PARTIALLY_REFUNDED: { label: 'Partially refunded', cls: 'status-cancelled' },
};

const PAYMENT_FILTERS = [
  { key: '', label: 'Any payment' },
  ...Object.entries(PAYMENT_LABELS).map(([key, v]) => ({ key, label: v.label })),
];

const PAGE_SIZE = 20;

// A QR order is paid after the seller confirms it: before that nothing is
// due; after it, the buyer pays from To Pay and the seller confirms it.
const qrUnpaid = (order) => order?.paymentMethod && order.paymentMethod !== 'COD' && order.paymentStatus === 'PENDING';
const paymentBadge = (order) => {
  if (qrUnpaid(order) && order.status === 'PENDING') return { label: 'Paid after you confirm', cls: 'status-pending' };
  if (qrUnpaid(order) && order.status === 'CONFIRMED') return { label: 'Waiting for payment', cls: 'status-pending' };
  return PAYMENT_LABELS[order?.paymentStatus] || null;
};

// A cancelled order the buyer paid for (verified, or a proof left unchecked
// past its deadline): the shop records the refund once the money is back.
// Why a seller cancels; a no-show and a refusal count on the buyer's record.
const cancelReasonsFor = (status, order = null) => {
  const riderFailed = ['FAILED', 'RETURNING'].includes(order?.riderDelivery?.status) && status === 'TO_SHIP';
  return [
    ['SELLER_CANCELLED', 'I can\'t fill this order'],
    ['OUT_OF_STOCK', 'Out of stock'],
    ...(['READY_FOR_PICKUP', 'READY'].includes(status) ? [['NO_SHOW', 'The buyer didn\'t come to pick it up']] : []),
    ...(status === 'OUT_FOR_DELIVERY' || riderFailed ? [['REFUSED', 'The buyer refused the delivery']] : []),
    ...(riderFailed ? [['NO_SHOW', "The buyer wasn't there for the rider"]] : []),
  ];
};

/** The buyer's last year at a glance: finished orders, and any that fell through on their side. */
function BuyerRecord({ orderId }) {
  const [record, setRecord] = useState(null);
  useEffect(() => {
    let cancelled = false;
    axios.get(`/orders/${orderId}/buyer-record`)
      .then((res) => { if (!cancelled) setRecord(res.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [orderId]);
  if (!record) return null;
  const issues = [
    record.noShows && `${record.noShows} no-show${record.noShows === 1 ? '' : 's'}`,
    record.refused && `${record.refused} refused`,
    record.unpaid && `${record.unpaid} unpaid`,
  ].filter(Boolean);
  return (
    <span className={`so-buyer-record${issues.length ? ' is-warn' : ''}`} title="This buyer's orders in the last 12 months, at any shop">
      {record.completed} order{record.completed === 1 ? '' : 's'} completed{issues.length ? ` · ${issues.join(' · ')}` : ''}{record.phoneVerified ? ' · verified number' : ''}
    </span>
  );
}

const canMarkRefunded = (order) => ['PAID', 'PENDING_VERIFICATION'].includes(order?.paymentStatus) && order?.status === 'CANCELLED';

// Prepaid orders cannot move past confirmation until the payment is verified
// (the backend enforces the same rule).
const isAwaitingPayment = (order) => Boolean(order?.paymentMethod)
  && order.paymentMethod !== 'COD'
  && order.paymentStatus !== 'PAID';

/** The one next step, or null (waiting for the buyer's payment, or for the buyer). */
function nextStep(order) {
  // A MoorMove rider takes it from packing on: Call a rider instead (SellerRiderPanel).
  if (isRiderOrder(order) && order.fulfillmentMethod !== 'PICKUP' && order.status !== 'PENDING') return null;
  const step = NEXT_STEP[order?.fulfillmentMethod === 'PICKUP' ? 'PICKUP' : 'DELIVERY'][order?.status];
  const to = typeof step === 'function' ? step(order) : step;
  if (!to) return null;
  // A QR order goes on only once its payment is confirmed.
  if (to !== 'CONFIRMED' && isAwaitingPayment(order)) return null;
  return to;
}
// Not while a rider is on it (cancel the rider first), nor once a rider has
// the parcel; a parcel on its way back after a failed delivery may be cancelled.
const canCancel = (order) => CANCELLABLE.includes(order?.status)
  && !(isRiderOrder(order) && ((riderOpen(order.riderDelivery) && !riderReturning(order.riderDelivery))
    || order.status === 'OUT_FOR_DELIVERY'));

const ACTION_LABELS = {
  CONFIRMED: { label: 'Confirm order', cls: 'action-confirm' },
  PREPARING: { label: 'Start packing', cls: 'action-prepare' },
  TO_SHIP: { label: 'Packed: ready to ship', cls: 'action-prepare' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', cls: 'action-ready' },
  SHIPPED: { label: 'Ship with courier', cls: 'action-ready' },
  DELIVERED: { label: 'Mark delivered', cls: 'action-complete' },
  READY_FOR_PICKUP: { label: 'Ready for pickup', cls: 'action-ready' },
  PICKED_UP: { label: 'Mark picked up', cls: 'action-complete' },
  COMPLETED: { label: 'Mark completed', cls: 'action-complete' },
  CANCELLED: { label: 'Cancel order', cls: 'action-cancel' },
};

export default function SellerOrders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const ctx = useOutletContext() || {};
  // Phones: a few stage chips on one row; everything else in a sheet.
  const isPhone = usePhoneLayout();
  // The buyer a seller is filing a report against, or null when the dialog is
  // closed. Reports route to the buyer's own municipal admin.
  const [reportBuyer, setReportBuyer] = useState(null);
  const [activeTab, setActiveTab] = useState(() => tabFromLink(searchParams.get('status'), isPhone));
  // Between phone and computer the tabs differ: keep to the same step.
  const [tabLayout, setTabLayout] = useState(isPhone);
  if (tabLayout !== isPhone) {
    setTabLayout(isPhone);
    setActiveTab((key) => tabForLayout(key, isPhone));
  }
  // Each tab's first page as it showed last time: shown at once while it is
  // asked for again.
  const [saved] = useState(() => readCache(`seller:orders:${activeTab}`));
  const [orders, setOrders] = useState(() => saved?.orders || []);
  const [isLoading, setIsLoading] = useState(() => !saved);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Orders per status (computers' tabs) and per stage (phones' tabs).
  const [stageCounts, setStageCounts] = useState({});
  const [stages, setStages] = useState({});
  // Payment proofs to check, from the sidebar's own count.
  const paymentsDue = ctx.waiting?.['/seller/orders?status=payment']?.count || 0;
  // Computers: orders ticked for a bulk step (confirm, packed, slips).
  const [picked, setPicked] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  // Server-side filters: order number search, created-at range and payment
  // status, all sent as query params to GET /orders/store/orders.
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(() => saved?.pagination || { total: 0, totalPages: 1, hasNext: false });
  const [cancelConfirm, setCancelConfirm] = useState(null); // { orderId, status }
  const [cancelReason, setCancelReason] = useState('SELLER_CANCELLED');
  const [rejectConfirm, setRejectConfirm] = useState(null); // { orderId }
  const [refundConfirm, setRefundConfirm] = useState(null); // { orderId }
  const [verifyingId, setVerifyingId] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  // The order's details: a panel beside the list on computers (Escape
  // closes it), a real dialog on phones (focus kept inside, Escape or a tap
  // outside closes it).
  const closeDetail = () => setSelectedOrder(null);
  const detailRef = useFocusTrap(Boolean(selectedOrder), { onClose: closeDetail, modal: isPhone });
  // MoorMove riders: on for the site, and the step being asked (Call a rider…).
  const { enabled: ridersOn } = useMoormove();
  const [riderAsk, setRiderAsk] = useState(null); // { action, order }

  // Typing shouldn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    loadOrders();
  }, [activeTab, page, debouncedSearch, from, to, paymentFilter]);

  const selectTab = (key) => {
    if (key === activeTab) return;
    setActiveTab(key);
    setPage(1);
    setPicked(new Set());
  };

  // After a step the order is in another tab: go there with it, and pick
  // it out, so the seller sees where it went.
  const [movedId, setMovedId] = useState(null);
  const moveToTab = (orderId, status, note) => {
    const desktopTab = sellerTabOf(status);
    const order = orders.find((o) => o.id === orderId);
    // Phones: the step it is in now (a QR order waits for its payment first).
    const tab = !isPhone ? desktopTab
      : status === 'CONFIRMED' && isAwaitingPayment(order) ? 'all'
        : DESKTOP_TO_PHONE[desktopTab] || 'all';
    const label = (isPhone ? PHONE_TABS : SELLER_TABS).find((t) => t.key === tab)?.label || statusOf(status).label;
    toast.success(note ? `${note}. Moved to ${label}.` : `Moved to ${label}`);
    setMovedId(orderId);
    if (tab !== activeTab) selectTab(tab);
    setTimeout(() => setMovedId((id) => (id === orderId ? null : id)), 3500);
  };
  useEffect(() => {
    if (!movedId || isLoading) return;
    document.getElementById(`so-row-${movedId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [movedId, isLoading, orders]);

  const applyFilter = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const hasFilters = Boolean(debouncedSearch || from || to || paymentFilter);

  const clearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setFrom('');
    setTo('');
    setPaymentFilter('');
    setPage(1);
  };

  const loadOrders = async () => {
    const viewKey = page === 1 && !debouncedSearch && !from && !to && !paymentFilter
      ? `seller:orders:${activeTab}`
      : null;
    const kept = viewKey ? readCache(viewKey) : undefined;
    if (kept) {
      setOrders(kept.orders || []);
      if (kept.pagination) setPagination(kept.pagination);
    } else {
      setIsLoading(true);
    }
    setLoadFailed(false);
    try {
      const params = {
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch || undefined,
        from: from || undefined,
        to: to || undefined,
        paymentStatus: paymentFilter || undefined,
        // The tab's own filter last: Payment to check is a payment status.
        ...tabQuery(activeTab),
      };
      const res = await axios.get('/orders/store/orders', { params });
      // The tab counts, fresh with every load.
      axios.get('/orders/store/stages').then((r) => {
        setStageCounts(r.data?.byStatus || {});
        setStages(r.data || {});
      }).catch(() => {});
      // New orders: the ones that cancel soonest first.
      const loaded = ['PENDING', 'new'].includes(activeTab) ? soonestFirst(res.data || []) : (res.data || []);
      setOrders(loaded);
      if (res.pagination) setPagination(res.pagination);
      if (viewKey) writeCache(viewKey, { orders: loaded, pagination: res.pagination || null });
      // Deep-link support: /seller/orders?id=<orderId> opens that order's detail panel
      const targetId = searchParams.get('id');
      if (targetId) {
        const match = loaded.find((o) => o.id === targetId);
        if (match) {
          setSelectedOrder(match);
        } else {
          // Not on this page; fetch it directly so the link still works.
          axios.get(`/orders/${targetId}`).then((r) => { if (r.data) setSelectedOrder(r.data); }).catch(() => {});
        }
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete('id');
          return next;
        }, { replace: true });
      }
    } catch {
      // Said on the page with Try again (not a toast over an empty list),
      // unless the last copy of this tab is still on screen.
      if (!kept) {
        setOrders([]);
        setLoadFailed(true);
      } else {
        toast.error("Couldn't refresh your orders. Showing the last ones loaded.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Message the buyer: opens (or starts) the chat with them.
  const messageBuyer = async (buyerId) => {
    if (!buyerId) return;
    setOpeningChat(true);
    try {
      const res = await axios.post('/messages/conversations', { buyerId });
      navigate(`/seller/messages?c=${res.data.id}`);
    } catch (err) {
      toast.error(err.message || 'Could not open the chat');
    } finally {
      setOpeningChat(false);
    }
  };

  const printSlips = (list) => {
    if (!printPackingSlips(list, { shopName: ctx.store?.name })) toast.error('Pick at least one order to print');
  };

  // Bulk steps on the ticked orders, one request each (the same rules as a
  // single step: an order that moved on meanwhile is skipped and reported).
  const pickedOrders = orders.filter((o) => picked.has(o.id));
  const toConfirm = pickedOrders.filter((o) => o.status === 'PENDING');
  const toPack = pickedOrders.filter((o) => ['TO_SHIP', 'READY_FOR_PICKUP'].includes(nextStep(o)) && o.status !== 'PENDING');
  const togglePick = (id) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allPicked = orders.length > 0 && orders.every((o) => picked.has(o.id));
  const pickAll = () => setPicked(allPicked ? new Set() : new Set(orders.map((o) => o.id)));
  const runBulk = async (list, kind) => {
    const confirming = kind === 'confirm';
    const n = list.length;
    const ok = await confirmAction({
      title: confirming ? `Confirm ${n} ${n === 1 ? 'order' : 'orders'}?` : `Mark ${n} ${n === 1 ? 'order' : 'orders'} as packed?`,
      message: confirming
        ? 'Each buyer is told their order is confirmed. Only confirm what you can fill.'
        : 'Delivery orders move to To ship and pickup orders to Ready for pickup; each buyer is told.',
      confirmLabel: confirming ? 'Confirm orders' : 'Mark packed',
    });
    if (!ok) return;
    setBulkBusy(true);
    let done = 0;
    const failed = [];
    for (const order of list) {
      try {
        await axios.put(`/orders/${order.id}/status`, { status: confirming ? 'CONFIRMED' : nextStep(order) });
        done += 1;
      } catch (err) {
        failed.push(`#${order.orderNumber}: ${err.message || 'not updated'}`);
      }
    }
    setBulkBusy(false);
    setPicked(new Set());
    if (done) toast.success(`${done} ${done === 1 ? 'order' : 'orders'} ${confirming ? 'confirmed' : 'marked packed'}`);
    if (failed.length) toast.error(`Not updated: ${failed.slice(0, 3).join('; ')}${failed.length > 3 ? ` and ${failed.length - 3} more` : ''}`);
    loadOrders();
  };

  const handleStatusChange = async (orderId, newStatus, proofUrl, extra = {}) => {
    setUpdatingId(orderId);
    try {
      const res = await axios.put(`/orders/${orderId}/status`, { status: newStatus, ...(proofUrl ? { proofUrl } : {}), ...extra });
      moveToTab(orderId, res.data?.status || newStatus);
      applyOrderUpdate(orderId, {
        status: res.data?.status || newStatus,
        paymentStatus: res.data?.paymentStatus,
        fulfillmentProofUrl: res.data?.fulfillmentProofUrl,
        fulfillmentProofAt: res.data?.fulfillmentProofAt,
      });
      return true;
    } catch (err) {
      toast.error(err.message || 'Failed to update order');
      // 409: the order moved on under us (buyer cancelled, another tab acted).
      // Refetch so the list shows the real state instead of a stale action.
      if (err.status === 409) loadOrders();
      return false;
    } finally {
      setUpdatingId(null);
    }
  };

  // Merge server-side changes (status/payment) into the list and detail panel.
  function applyOrderUpdate(orderId, changes) {
    const clean = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...clean } : o)));
    setSelectedOrder((prev) => (prev?.id === orderId ? { ...prev, ...clean } : prev));
  }

  // A rider step went through: the order as the server has it now (or, when
  // it had moved on meanwhile, the list again).
  const riderDone = (updated) => {
    const before = riderAsk?.order;
    if (!updated?.id) { loadOrders(); return; }
    applyOrderUpdate(updated.id, updated);
    if (before && updated.status && updated.status !== before.status) moveToTab(updated.id, updated.status);
  };
  // The live map's latest answer: the rider's step and the order's status.
  const riderTracking = (t) => {
    if (!t?.orderId) return;
    const current = orders.find((o) => o.id === t.orderId) || (selectedOrder?.id === t.orderId ? selectedOrder : null);
    const same = current && current.status === t.status
      && JSON.stringify(current.riderDelivery || null) === JSON.stringify(t.riderDelivery || null);
    if (!same) applyOrderUpdate(t.orderId, { status: t.status || undefined, riderDelivery: t.riderDelivery ?? undefined });
  };
  const askRider = (order, action) => setRiderAsk({ action, order });

  const PAYMENT_TOASTS = {
    PAID: 'Payment confirmed. You can now prepare the order.',
    FAILED: 'Payment rejected — the buyer will be asked to upload a new proof',
    REFUNDED: 'Refund recorded',
  };

  // PATCH /orders/:id/payment { paymentStatus: 'PAID' | 'FAILED' | 'REFUNDED' }.
  // Rejecting no longer cancels the order: it stays open with its stock and
  // paymentStatus FAILED until the buyer resubmits proof.
  const handlePaymentDecision = async (orderId, paymentStatus) => {
    setVerifyingId(orderId);
    try {
      const res = await axios.patch(`/orders/${orderId}/payment`, { paymentStatus });
      applyOrderUpdate(orderId, {
        paymentStatus: res.data?.paymentStatus || paymentStatus,
        status: res.data?.status,
      });
      toast.success(PAYMENT_TOASTS[paymentStatus] || 'Payment updated');
    } catch (err) {
      toast.error(err.message || 'Failed to update payment');
      loadOrders();
    } finally {
      setVerifyingId(null);
      setRejectConfirm(null);
      setRefundConfirm(null);
    }
  };

  const displayed = orders;

  // Handing an order over asks for a photo first: proof of delivery or of pickup.
  const [proofRequest, setProofRequest] = useState(null);
  // Shipping with a courier asks for the courier and the tracking number.
  const [shipRequest, setShipRequest] = useState(null);

  const requestStatusChange = (orderId, newStatus) => {
    if (newStatus === 'CANCELLED') {
      const target = orders.find((o) => o.id === orderId) || (selectedOrder?.id === orderId ? selectedOrder : null);
      setCancelConfirm({ orderId, status: target?.status, order: target });
      setCancelReason('SELLER_CANCELLED');
      return;
    }
    const order = orders.find((o) => o.id === orderId) || (selectedOrder?.id === orderId ? selectedOrder : null);
    if (newStatus === 'SHIPPED') {
      setShipRequest({
        orderId,
        orderNumber: order?.orderNumber,
        courier: order?.courier || (order?.courierId ? { id: order.courierId, name: order.courierName } : null),
      });
      return;
    }
    const pickup = order?.fulfillmentMethod === 'PICKUP';
    if ((newStatus === 'DELIVERED' && !pickup) || (newStatus === 'PICKED_UP' && pickup)) {
      setProofRequest({ orderId, status: newStatus, kind: pickup ? 'PICKUP' : 'DELIVERY', orderNumber: order?.orderNumber });
      return;
    }
    handleStatusChange(orderId, newStatus);
  };

  const confirmProof = async (proofUrl) => {
    if (!proofRequest) return;
    const ok = await handleStatusChange(proofRequest.orderId, proofRequest.status, proofUrl);
    if (ok) setProofRequest(null);
    return ok;
  };

  const confirmShip = async ({ courierId, trackingNumber }) => {
    if (!shipRequest) return false;
    const { orderId } = shipRequest;
    setUpdatingId(orderId);
    try {
      const res = await axios.patch(`/orders/${orderId}/ship`, { courierId, trackingNumber });
      const courier = shipRequest.courier || null;
      applyOrderUpdate(orderId, {
        status: res.data?.status || 'SHIPPED',
        paymentStatus: res.data?.paymentStatus,
        courierId,
        courierName: res.data?.courierName,
        trackingNumber: res.data?.trackingNumber,
        shippedAt: res.data?.shippedAt,
        courier,
      });
      moveToTab(orderId, res.data?.status || 'SHIPPED', 'Shipped. The buyer can now track it');
      setShipRequest(null);
      return true;
    } catch (err) {
      toast.error(err.message || 'Could not ship the order');
      if (err.status === 409) loadOrders();
      return false;
    } finally {
      setUpdatingId(null);
    }
  };

  const confirmCancelOrder = async () => {
    if (!cancelConfirm) return;
    await handleStatusChange(cancelConfirm.orderId, 'CANCELLED', null, { cancelReason });
    setCancelConfirm(null);
  };

  // The order-number search: in the header on phones, at the head of the
  // list's toolbar on computers.
  const searchBox = (
    <div className="seller-search">
      <MagnifyingGlass size={15} />
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Order no., buyer or product"
        aria-label="Search your orders by order number, buyer or product"
      />
      {search && (
        <button type="button" onClick={() => setSearch('')} aria-label="Clear search">
          <X size={12} weight="bold" />
        </button>
      )}
      {isPhone && (
        <button type="button" className="so-filter-btn" onClick={() => setFilterOpen(true)} aria-label="Filter by date or payment">
          <SlidersHorizontal size={17} weight="bold" />
          {(from || to || paymentFilter) && <span className="scm-chip-dot" />}
        </button>
      )}
    </div>
  );

  // A tab's count: payments from the sidebar's count; phones' steps from the
  // stage counts; computers' tabs from the per-status counts.
  const countFor = (t) => {
    if (t.key === 'payment') return paymentsDue;
    if (t.key === 'all' || t.final) return 0;
    return PHONE_KEYS.has(t.key) && !SELLER_TABS.some((s) => s.key === t.key) ? (stages[t.key] || 0) : tabCount(t, stageCounts);
  };
  // Payment to check shows while there is one to check (or it is open).
  const showTab = (t) => t.key !== 'payment' || paymentsDue > 0 || activeTab === 'payment';
  // Computers: "To pack" (opened from the dashboard) shows as its own tab.
  const desktopTabs = activeTab === 'to_ship'
    ? [...DESKTOP_TABS.slice(0, 3), PHONE_TABS.find((t) => t.key === 'to_ship'), ...DESKTOP_TABS.slice(3)]
    : DESKTOP_TABS;
  const tabButton = (t, cls, onCls) => (
    <button
      key={t.key}
      type="button"
      role="tab"
      aria-selected={activeTab === t.key}
      className={`${cls}${activeTab === t.key ? ` ${onCls}` : ''}${t.key === 'payment' ? ' so-tab-pay' : ''}`}
      onClick={() => selectTab(t.key)}
    >
      {t.label}
      {countFor(t) > 0 && <em className="so-tab-count">{countFor(t)}</em>}
    </button>
  );

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <SellerPageHead
          title="Orders"
          subtitle="Confirm new orders, check payments, pack and hand them over."
          actions={isPhone ? searchBox : null}
        />

        {isPhone ? (
          <>
            <div className="scm-chips so-stage-chips" role="tablist" aria-label="Show orders">
              {PHONE_TABS.filter(showTab).map((t) => tabButton(t, 'scm-chip', 'is-on'))}
            </div>
            {!isLoading && pagination.total > 0 && (
              <p className="som-count">{pagination.total} order{pagination.total === 1 ? '' : 's'}</p>
            )}
            <PhoneSheet
              open={filterOpen}
              title="Filter orders"
              onClose={() => setFilterOpen(false)}
              footer={(
                <>
                  <button type="button" className="scm-btn scm-btn--ghost" onClick={() => clearFilters()}>
                    Reset
                  </button>
                  <button type="button" className="scm-btn" onClick={() => setFilterOpen(false)}>Done</button>
                </>
              )}
            >
              <span className="scm-sheet-label">Date ordered</span>
              <div className="scm-field-row">
                <label className="scm-field">
                  From
                  <input type="date" value={from} max={to || undefined} onChange={(e) => applyFilter(setFrom)(e.target.value)} />
                </label>
                <label className="scm-field">
                  To
                  <input type="date" value={to} min={from || undefined} onChange={(e) => applyFilter(setTo)(e.target.value)} />
                </label>
              </div>
              <span className="scm-sheet-label">Payment</span>
              <label className="scm-field">
                <Select value={paymentFilter} onChange={(e) => applyFilter(setPaymentFilter)(e.target.value)} aria-label="Payment">
                  {PAYMENT_FILTERS.map((p) => (
                    <option key={p.key || 'any'} value={p.key}>{p.label}</option>
                  ))}
                </Select>
              </label>
            </PhoneSheet>
          </>
        ) : (
        <>
        {/* Tabs */}
        <div className="seller-tabs" role="tablist" aria-label="Show orders">
          {desktopTabs.filter(showTab).map((t) => tabButton(t, 'seller-tab', 'seller-tab--active'))}
        </div>

        {/* The list's toolbar: search, date range and payment (server-side). */}
        <div className="so-filters">
          {searchBox}
          <label className="so-filter">
            <span>From</span>
            <input type="date" value={from} max={to || undefined} onChange={(e) => applyFilter(setFrom)(e.target.value)} />
          </label>
          <label className="so-filter">
            <span>To</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => applyFilter(setTo)(e.target.value)} />
          </label>
          <label className="so-filter">
            <span>Payment</span>
            <Select value={paymentFilter} onChange={(e) => applyFilter(setPaymentFilter)(e.target.value)}>
              {PAYMENT_FILTERS.map((p) => (
                <option key={p.key || 'any'} value={p.key}>{p.label}</option>
              ))}
            </Select>
          </label>
          {hasFilters && (
            <button type="button" className="btn-seller-outline so-filter-clear" onClick={clearFilters}>
              <X size={12} weight="bold" /> Clear
            </button>
          )}
          {!isLoading && pagination.total > 0 && (
            <span className="so-filter-count">{pagination.total} order{pagination.total === 1 ? '' : 's'}</span>
          )}
        </div>
        </>
        )}

        {/* Computers: what to do with the ticked orders. */}
        {!isPhone && picked.size > 0 && (
          <div className="so-bulk" role="region" aria-label="Ticked orders">
            <span><strong>{picked.size}</strong> {picked.size === 1 ? 'order' : 'orders'} ticked</span>
            <button type="button" className="btn-seller-outline" disabled={bulkBusy || !toConfirm.length} onClick={() => runBulk(toConfirm, 'confirm')}>
              <CheckCircle size={15} /> Confirm{toConfirm.length ? ` (${toConfirm.length})` : ''}
            </button>
            <button type="button" className="btn-seller-outline" disabled={bulkBusy || !toPack.length} onClick={() => runBulk(toPack, 'pack')}>
              <Package size={15} /> Mark packed{toPack.length ? ` (${toPack.length})` : ''}
            </button>
            <button type="button" className="btn-seller-outline" disabled={bulkBusy} onClick={() => printSlips(pickedOrders)}>
              <Printer size={15} /> Print slips ({pickedOrders.length})
            </button>
            <button type="button" className="so-bulk-clear" onClick={() => setPicked(new Set())}>Clear</button>
            {bulkBusy && <Spinner size={16} />}
          </div>
        )}

        <div className={`orders-layout${selectedOrder ? '' : ' is-single'}`}>
          {/* Order list */}
          <div className="seller-card orders-list-card">
            {isLoading ? (
              <Skeleton.Table cols={6} rows={6} />
            ) : loadFailed ? (
              <LoadFailed onRetry={loadOrders} what="your orders" />
            ) : displayed.length === 0 ? (
              <div className="seller-empty is-page">
                <EmptyArt name="orders" size={168} />
                <strong>{hasFilters ? 'No orders match your filters' : activeTab === 'all' ? 'No orders yet' : 'No orders here right now'}</strong>
                <p>
                  {hasFilters
                    ? 'Try a different search, date range or payment status.'
                    : activeTab === 'payment' ? 'Payment proofs from buyers show here for you to check.'
                      : 'New orders from buyers will appear here.'}
                </p>
                {hasFilters && (
                  <button type="button" className="btn-seller-outline" onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <>
              <table className="seller-table so-orders-table">
                <thead>
                  <tr>
                    {!isPhone && (
                      <th className="so-col-pick">
                        <input type="checkbox" checked={allPicked} onChange={pickAll} aria-label="Tick every order on this page" />
                      </th>
                    )}
                    <th className="so-col-num">Order #</th>
                    <th>Products</th>
                    <th className="so-col-buyer">Buyer</th>
                    <th className="so-col-total">Total</th>
                    <th className="so-col-status">Status</th>
                    <th className="so-col-action">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(order => {
                    const s = statusOf(order.status, order.fulfillmentMethod);
                    const next = nextStep(order);
                    const riderNext = riderNextAction(order, ridersOn);
                    const riderLine = isRiderOrder(order) && order.riderDelivery ? riderStatus(order.riderDelivery, 'seller', order) : null;
                    const isUpdating = updatingId === order.id;
                    const items = order.items || [];
                    const totalQty = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
                    const orderDate = order.createdAt
                      ? new Date(order.createdAt).toLocaleDateString('en-PH', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })
                      : '';
                    return (
                      <tr
                        key={order.id}
                        id={`so-row-${order.id}`}
                        className={`${selectedOrder?.id === order.id ? 'row-selected' : ''}${movedId === order.id ? ' is-moved' : ''}`.trim()}
                      >
                        {!isPhone && (
                          <td className="so-col-pick">
                            <input
                              type="checkbox"
                              checked={picked.has(order.id)}
                              onChange={() => togglePick(order.id)}
                              aria-label={`Tick order #${order.orderNumber}`}
                            />
                          </td>
                        )}
                        <td className="order-num">
                          <div title={`#${order.orderNumber || order.id.slice(-6).toUpperCase()}`}>#{order.orderNumber || order.id.slice(-6).toUpperCase()}</div>
                          {orderDate && <div className="so-order-date">{orderDate}</div>}
                          <TodayTag order={order} />
                          <ConfirmByTag order={order} />
                          <CookTag order={order} />
                        </td>
                        <td>
                          <div className="so-products">
                            <div className="so-product-thumbs">
                              {items.slice(0, 3).map((it) => {
                                const src = resolveImg(lineImage(it.product, it.selectedVariations));
                                return (
                                  <div key={it.id} className="so-product-thumb" title={it.product?.name}>
                                    {src ? (
                                      <img
                                        src={src}
                                        alt={it.product?.name || 'Product'}
                                        onError={(e) => { e.currentTarget.hidden = true; }}
                                      />
                                    ) : (
                                      <span className="so-product-thumb-fallback">
                                        <Package size={14} />
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                              {items.length > 3 && (
                                <div className="so-product-thumb so-product-more">+{items.length - 3}</div>
                              )}
                            </div>
                            <div className="so-product-summary">
                              {items.length === 0 ? (
                                <span className="so-product-name">No items</span>
                              ) : (
                                <>
                                  <span className="so-product-name">
                                    {items[0].product?.name || 'Product'}
                                    {items.length > 1 && (
                                      <span className="so-product-extra"> +{items.length - 1} more</span>
                                    )}
                                  </span>
                                  <span className="so-product-meta">
                                    {items.length} {items.length === 1 ? 'item' : 'items'} · {items.length === 1 && ['LIVESTOCK', 'PACKAGE'].includes(lineKind(items[0])) ? countLabel(items[0]) : `Qty ${totalQty}`}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="so-col-buyer">
                          <div className="so-buyer">
                            {order.buyer?.id ? (
                              <Link to={`/u/${order.buyer.id}`} className="so-buyer-name profile-link" title="View buyer profile">
                                {order.buyer.fullName || 'Buyer'}
                              </Link>
                            ) : (
                              <span className="so-buyer-name">{order.buyer?.fullName || 'Buyer'}</span>
                            )}
                            {/* The number on the order, one tap to call. */}
                            {order.contactNumber && (
                              <a href={telHref(order.contactNumber)} className="so-buyer-meta so-tel" aria-label={`Call ${order.buyer?.fullName || 'the buyer'} at ${order.contactNumber}`}>
                                {order.contactNumber}
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="so-col-total">{peso(order.total)}</td>
                        <td className="so-col-status">
                          <span className={`seller-badge seller-badge--solid ${s.cls}`}>
                            {s.label}
                          </span>
                          {proofToCheck(order) && <span className="so-pay-chip">Payment to check</span>}
                          {riderLine?.title && !['COMPLETED', 'CANCELLED'].includes(order.status) && (
                            <span className={`so-next so-rider-line is-${riderLine.tone}`}>{riderLine.title}</span>
                          )}
                          {orderPromo(order) && order.fulfillmentMethod !== 'PICKUP' && (
                            <span className="so-promo-chip" title={`MoorMove promo: ${orderPromo(order).title}`}>Free delivery</span>
                          )}
                        </td>
                        <td className="so-col-action">
                          <div className="order-row-actions">
                            <button
                              className="seller-icon-btn"
                              title="View details"
                              aria-label="View order details"
                              onClick={() => setSelectedOrder(
                                selectedOrder?.id === order.id ? null : order
                              )}
                            >
                              <Eye size={15} /><span className="so-action-label">Details</span>
                            </button>
                            {/* A payment proof waiting: open it straight at the check. */}
                            {proofToCheck(order) && (
                              <button
                                type="button"
                                className="so-next-btn so-check-pay"
                                onClick={() => {
                                  setSelectedOrder(order);
                                  setTimeout(() => document.getElementById('so-payment-check')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
                                }}
                              >
                                <QrCode size={14} weight="bold" /><span>Check payment</span>
                              </button>
                            )}
                            {riderNext && (
                              <button
                                type="button"
                                className="so-next-btn"
                                disabled={isUpdating}
                                onClick={() => askRider(order, riderNext)}
                              >
                                <span>{riderNext === 'cash' ? 'Cash received' : riderNext === 'parcel' ? 'Parcel back' : 'Call a rider'}</span>
                              </button>
                            )}
                            {next && (
                              <button
                                type="button"
                                className="so-next-btn"
                                disabled={isUpdating}
                                onClick={() => requestStatusChange(order.id, next)}
                              >
                                {isUpdating ? <Spinner size={14} /> : null}
                                <span>{ACTION_LABELS[next]?.label || next}</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {pagination.totalPages > 1 && (
                <div className="so-pagination">
                  <button
                    type="button"
                    className="btn-seller-outline so-pagination-btn"
                    disabled={page <= 1 || isLoading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </button>
                  <span>Page {page} of {pagination.totalPages}</span>
                  <button
                    type="button"
                    className="btn-seller-outline so-pagination-btn"
                    disabled={page >= pagination.totalPages || isLoading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
              </>
            )}
          </div>

          {/* Phones: the dimmed page behind the order; a tap there closes it. */}
          {selectedOrder && isPhone && (
            <button type="button" className="so-sheet-scrim" aria-label="Close order details" tabIndex={-1} onClick={closeDetail} />
          )}

          {/* Order detail panel */}
          {selectedOrder && (
            <div
              ref={detailRef}
              className="seller-card order-detail-panel"
              {...(isPhone ? { role: 'dialog', 'aria-modal': 'true' } : { role: 'region' })}
              aria-labelledby="so-detail-title"
            >
              <div className="seller-card-header">
                <h2 id="so-detail-title">Order #{selectedOrder.orderNumber || selectedOrder.id.slice(-6).toUpperCase()}</h2>
                <button type="button" className="seller-icon-btn so-detail-close" onClick={closeDetail} aria-label="Close order details">
                  <X size={18} weight="bold" />
                </button>
              </div>
              <div className="order-detail-body">
                {/* Status */}
                <div className="detail-row">
                  <span>Status</span>
                  <span className={`seller-badge seller-badge--solid ${statusOf(selectedOrder.status, selectedOrder.fulfillmentMethod).cls}`}>
                    {statusOf(selectedOrder.status, selectedOrder.fulfillmentMethod).label}
                  </span>
                </div>

                {selectedOrder.respondBy && (
                  <div className="detail-row detail-row--col so-today-detail">
                    <span>Available Today</span>
                    <p>
                      {selectedOrder.status === 'PENDING'
                        ? `Confirm by ${momentLabel(selectedOrder.respondBy)}, or it cancels on its own. `
                        : ''}
                      {selectedOrder.etaFrom ? `The buyer expects it ${spanLabel(selectedOrder.etaFrom, selectedOrder.etaTo || selectedOrder.etaFrom)}.` : ''}
                    </p>
                  </div>
                )}

                {cookingFor(selectedOrder) && (
                  <div className="detail-row detail-row--col so-today-detail">
                    <span>Paluto</span>
                    <p>Cooked to order. The buyer expects it {etaLabel(selectedOrder)}.</p>
                  </div>
                )}

                {(() => {
                  const next = sellerNext(selectedOrder);
                  return next.title ? (
                    <div className={`osp is-full so-next-panel is-${next.tone}`}>
                      <div className="osp-head-text">
                        <strong>{next.title}</strong>
                        {next.text && <p>{next.text}</p>}
                      </div>
                    </div>
                  ) : null;
                })()}

                {/* Buyer */}
                <div className="detail-row">
                  <span>Buyer</span>
                  <strong className="so-buyer-cell">
                    {selectedOrder.buyer?.id
                      ? <Link to={`/u/${selectedOrder.buyer.id}`} className="profile-link" title="View buyer profile">{selectedOrder.buyer.fullName || '—'}</Link>
                      : (selectedOrder.buyer?.fullName || '—')}
                    <BuyerRecord orderId={selectedOrder.id} />
                    {selectedOrder.buyer?.id && (
                      <button
                        type="button"
                        className="so-report-buyer"
                        onClick={() => setReportBuyer(selectedOrder.buyer)}
                        title="Report this buyer to their municipal admin"
                      >
                        <Flag size={14} /> Report
                      </button>
                    )}
                  </strong>
                </div>

                <div className="detail-row">
                  <span>Contact</span>
                  <strong>
                    {selectedOrder.contactNumber
                      ? <a href={telHref(selectedOrder.contactNumber)} className="so-tel">{selectedOrder.contactNumber}</a>
                      : '—'}
                  </strong>
                </div>

                {/* Reach the buyer: chat in the app, or call the order's number. */}
                <div className="so-contact-actions">
                  {selectedOrder.buyer?.id && (
                    <button
                      type="button"
                      className="btn-seller-outline"
                      disabled={openingChat}
                      onClick={() => messageBuyer(selectedOrder.buyer.id)}
                    >
                      <ChatCircleDots size={16} /> Message buyer
                    </button>
                  )}
                  {selectedOrder.contactNumber && (
                    <a href={telHref(selectedOrder.contactNumber)} className="btn-seller-outline">
                      <Phone size={16} /> Call
                    </a>
                  )}
                  <button type="button" className="btn-seller-outline" onClick={() => printSlips([selectedOrder])}>
                    <Printer size={16} /> Packing slip
                  </button>
                </div>

                <div className="detail-row">
                  <span>Fulfillment</span>
                  <strong>{selectedOrder.fulfillmentMethod === 'PICKUP' ? 'Store Pickup' : 'Delivery'}</strong>
                </div>

                {selectedOrder.fulfillmentMethod !== 'PICKUP' && (
                  <div className="detail-row">
                    <span>Delivered by</span>
                    <strong>
                      {isRiderOrder(selectedOrder)
                        ? `A MoorMove rider (buyer's choice)${orderPromo(selectedOrder) ? ' · free delivery promo' : ''}`
                        : selectedOrder.courierId
                          ? `${selectedOrder.courierName || selectedOrder.courier?.name} (buyer's choice)${selectedOrder.shippingWeightGrams ? ` · ${(selectedOrder.shippingWeightGrams / 1000).toLocaleString('en-PH', { maximumFractionDigits: 2 })} kg` : ''}`
                          : 'You'}
                    </strong>
                  </div>
                )}
                {fallbackLine(selectedOrder, 'seller') && (
                  <p className="rider-actions-note">{fallbackLine(selectedOrder, 'seller')}</p>
                )}

                <SellerRiderPanel
                  order={selectedOrder}
                  enabled={ridersOn}
                  busy={updatingId === selectedOrder.id}
                  onAsk={(action) => askRider(selectedOrder, action)}
                  onTracking={riderTracking}
                />

                <div className="detail-row">
                  <span>Payment</span>
                  <strong>
                    {payLabel(selectedOrder.paymentMethod || 'COD', selectedOrder.fulfillmentMethod === 'PICKUP')}
                    {selectedOrder.paymentReference && ` — Ref: ${selectedOrder.paymentReference}`}
                  </strong>
                </div>

                {selectedOrder.paymentStatus && (
                  <div className="detail-row">
                    <span>Payment status</span>
                    <span className={`seller-badge seller-badge--solid ${paymentBadge(selectedOrder)?.cls || ''}`}>
                      {paymentBadge(selectedOrder)?.label || selectedOrder.paymentStatus}
                    </span>
                  </div>
                )}

                {qrUnpaid(selectedOrder) && selectedOrder.status === 'PENDING' && (
                  <div className="so-payment-review">
                    <p>The buyer pays with your QR after you confirm this order. Confirm it if you can fill it; they&apos;ll be told to pay right away.</p>
                  </div>
                )}

                {qrUnpaid(selectedOrder) && selectedOrder.status === 'CONFIRMED' && (
                  <div className="so-payment-review">
                    <p>Waiting for the buyer to pay with your QR. You&apos;ll be notified when they send the reference and screenshot, then you confirm the payment and prepare the order. If they don&apos;t pay within 48 hours, the order is cancelled and its stock comes back.</p>
                  </div>
                )}

                {selectedOrder.paymentStatus === 'PENDING_VERIFICATION' && selectedOrder.status !== 'CANCELLED' && (
                  <div className="so-payment-review" id="so-payment-check">
                    <p>The buyer says they paid. Check the reference number and screenshot below against your GCash or bank records, then confirm the payment.</p>
                    <div className="so-payment-actions">
                      <button
                        type="button"
                        className="so-payment-btn so-payment-btn--approve"
                        disabled={verifyingId === selectedOrder.id}
                        onClick={() => handlePaymentDecision(selectedOrder.id, 'PAID')}
                      >
                        <CheckCircle size={16} /> Confirm payment
                      </button>
                      <button
                        type="button"
                        className="so-payment-btn so-payment-btn--reject"
                        disabled={verifyingId === selectedOrder.id}
                        onClick={() => setRejectConfirm({ orderId: selectedOrder.id })}
                      >
                        <XCircle size={16} /> Reject payment
                      </button>
                    </div>
                  </div>
                )}

                {selectedOrder.paymentStatus === 'FAILED' && selectedOrder.status !== 'CANCELLED' && (
                  <div className="so-payment-review">
                    <p>The proof was rejected. The order and its stock are kept while the buyer uploads a new one; it expires automatically if they don't.</p>
                  </div>
                )}

                {canMarkRefunded(selectedOrder) && (
                  <div className="so-payment-review">
                    <p>
                      This prepaid order was cancelled. If the buyer&apos;s payment reached you, return {Number(selectedOrder.refundDue) > 0 ? `₱${refundAmount(selectedOrder).toFixed(2)}` : 'it'}, then record the refund here.
                      {Number(selectedOrder.failedTripKept) > 0 && ` The ₱${Number(selectedOrder.failedTripKept).toFixed(2)} delivery fee covers the failed trip.`}
                    </p>
                    <div className="so-payment-actions">
                      <button
                        type="button"
                        className="so-payment-btn so-payment-btn--approve"
                        disabled={verifyingId === selectedOrder.id}
                        onClick={() => setRefundConfirm({ orderId: selectedOrder.id })}
                      >
                        <CheckCircle size={16} /> Mark refunded
                      </button>
                    </div>
                  </div>
                )}

                {selectedOrder.paymentProofUrl && (
                  <div className="detail-row detail-row--col">
                    <span>Payment Proof</span>
                    <a
                      className="payment-proof"
                      href={resolveImg(selectedOrder.paymentProofUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Click or hover to preview"
                    >
                      <img
                        src={resolveImg(selectedOrder.paymentProofUrl)}
                        alt="Payment proof"
                      />
                      <span className="payment-proof-zoom">Hover to preview · Click to open</span>
                    </a>
                  </div>
                )}

                {selectedOrder.fulfillmentProofUrl && (
                  <div className="detail-row detail-row--col">
                    <OrderProof order={selectedOrder} resolve={resolveImg} />
                  </div>
                )}

                {selectedOrder.trackingNumber && (
                  <div className="detail-row detail-row--col">
                    <CourierTracking order={selectedOrder} />
                  </div>
                )}

                {/* Address */}
                <div className="detail-row detail-row--col">
                  <span>{selectedOrder.fulfillmentMethod === 'PICKUP' ? 'Pickup Location' : 'Delivery Address'}</span>
                  <p className="detail-address">{selectedOrder.deliveryAddress || '—'}</p>
                  {selectedOrder.deliveryLatitude != null && (
                    <a
                      className="so-map-link"
                      href={`https://www.google.com/maps/search/?api=1&query=${selectedOrder.deliveryLatitude},${selectedOrder.deliveryLongitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open the buyer's pin in Maps
                    </a>
                  )}
                </div>

                {selectedOrder.deliveryNotes && (
                  <div className="detail-row detail-row--col">
                    <span>Notes</span>
                    <p className="detail-address">{selectedOrder.deliveryNotes}</p>
                  </div>
                )}

                {/* Items */}
                <div className="detail-items">
                  <p className="detail-items-title">Items</p>
                  {(selectedOrder.items || []).map(item => (
                    <div key={item.id} className="detail-item">
                      <span>
                        {item.product?.name || item.productName || item.productId}
                        {item.selectedVariations && Object.keys(item.selectedVariations).length > 0 && (
                          <small className="detail-item-variations">
                            {Object.entries(item.selectedVariations).map(([name, value]) => `${name}: ${value}`).join(' · ')}
                          </small>
                        )}
                        {lineNote(item) && <small className="detail-item-variations">{lineNote(item)}</small>}
                      </span>
                      <span>{qtyLabel(item)}</span>
                      <span>₱{(Number(item.price) * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className="detail-totals">
                  <div className="detail-total-row">
                    <span>Subtotal</span>
                    <span>₱{Number(selectedOrder.subtotal).toFixed(2)}</span>
                  </div>
                  <div className="detail-total-row">
                    <span>
                      Delivery fee
                      {distanceNote(selectedOrder) && <small className="summary-km">{distanceNote(selectedOrder)}</small>}
                    </span>
                    <span>
                      {orderPromo(selectedOrder) && Number(selectedOrder.deliveryFee || 0) === 0
                        ? 'Free (MoorMove promo)'
                        : `₱${Number(selectedOrder.deliveryFee || 0).toFixed(2)}`}
                    </span>
                  </div>
                  {Number(selectedOrder.discountAmount) > 0 && (
                    <div className="detail-total-row">
                      <span>Discount{selectedOrder.voucherCode ? ` (${selectedOrder.voucherCode})` : ''}</span>
                      <span>−₱{Number(selectedOrder.discountAmount).toFixed(2)}</span>
                    </div>
                  )}
                  {carriedFeeLines(selectedOrder).map((line) => (
                    <div key={line.key} className="detail-total-row">
                      <span>{line.label}</span>
                      <span>₱{line.amount.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="detail-total-row detail-total-row--bold">
                    <span>Total</span>
                    <span>₱{Number(selectedOrder.total).toFixed(2)}</span>
                  </div>
                  {riderFeeNote(selectedOrder) && (
                    <div className="detail-total-row">
                      <span>
                        Your sale
                        <small className="summary-km">{` · ${riderFeeNote(selectedOrder)}`}</small>
                      </span>
                      <span>₱{Number(selectedOrder.shopTotal ?? selectedOrder.total).toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* The next step: at the foot of the panel, kept in view on
                    phones while the details scroll. */}
                <div className="so-detail-foot">
                  {nextStep(selectedOrder) && (
                    <div className="detail-actions">
                      <button
                        type="button"
                        className={`detail-action-btn ${ACTION_LABELS[nextStep(selectedOrder)]?.cls || ''}`}
                        disabled={updatingId === selectedOrder.id}
                        onClick={() => requestStatusChange(selectedOrder.id, nextStep(selectedOrder))}
                      >
                        {ACTION_LABELS[nextStep(selectedOrder)]?.label || nextStep(selectedOrder)}
                      </button>
                    </div>
                  )}

                  {/* Receipt link */}
                  {['COMPLETED', 'DELIVERED', 'PICKED_UP', 'SHIPPED'].includes(selectedOrder.status) && (
                    <div className="detail-actions">
                      <Link
                        to={`/orders/${selectedOrder.id}/receipt`}
                        className="detail-action-btn action-complete"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <FileText size={14} className="so-receipt-icon" /> View receipt
                      </Link>
                    </div>
                  )}
                  {canCancel(selectedOrder) && (
                    <button type="button" className="so-cancel-link" onClick={() => requestStatusChange(selectedOrder.id, 'CANCELLED')}>
                      Cancel this order
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ShipOrderSheet
        open={!!shipRequest}
        couriers={shipRequest?.courier ? [shipRequest.courier] : []}
        orderNumber={shipRequest?.orderNumber}
        onCancel={() => setShipRequest(null)}
        onConfirm={confirmShip}
      />
      <RiderActionSheet
        ask={riderAsk}
        onClose={() => setRiderAsk(null)}
        onDone={riderDone}
      />
      <ProofPhotoSheet
        open={!!proofRequest}
        kind={proofRequest?.kind}
        orderNumber={proofRequest?.orderNumber}
        onCancel={() => setProofRequest(null)}
        onConfirm={confirmProof}
      />
      <ConfirmDialog
        open={!!cancelConfirm}
        title="Cancel this order?"
        message="The buyer is told, and the stock goes back into your shop. This can't be undone."
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        danger
        loading={updatingId === cancelConfirm?.orderId}
        onConfirm={confirmCancelOrder}
        onCancel={() => setCancelConfirm(null)}
      >
        {refundLine(cancelConfirm?.order) && (
          <p className="so-cancel-refund">{refundLine(cancelConfirm.order)}</p>
        )}
        <div className="so-cancel-reasons" role="radiogroup" aria-label="Why">
          {cancelReasonsFor(cancelConfirm?.status, cancelConfirm?.order).map(([key, label]) => (
            <label key={key} className={cancelReason === key ? 'is-on' : ''}>
              <input type="radio" name="cancel-reason" checked={cancelReason === key} onChange={() => setCancelReason(key)} />
              {label}
            </label>
          ))}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!rejectConfirm}
        title="Reject this payment?"
        message="Only reject if the payment did not arrive or the proof is invalid. The buyer will be asked to upload a new proof. The order and its stock are kept."
        confirmLabel="Reject payment"
        cancelLabel="Keep checking"
        danger
        loading={verifyingId === rejectConfirm?.orderId}
        onConfirm={() => handlePaymentDecision(rejectConfirm.orderId, 'FAILED')}
        onCancel={() => setRejectConfirm(null)}
      />

      <ConfirmDialog
        open={!!refundConfirm}
        title="Mark this order as refunded?"
        message={`Only confirm once the buyer has received ${selectedOrder?.id === refundConfirm?.orderId && Number(selectedOrder?.refundDue) > 0 ? peso(refundAmount(selectedOrder)) : 'their money'} back. This records the refund on the order and can't be undone.`}
        confirmLabel="Mark refunded"
        cancelLabel="Not yet"
        loading={verifyingId === refundConfirm?.orderId}
        onConfirm={() => handlePaymentDecision(refundConfirm.orderId, 'REFUNDED')}
        onCancel={() => setRefundConfirm(null)}
      />
      {reportBuyer && (
        <ReportModal
          type="BUYER"
          reportedBuyerId={reportBuyer.id}
          targetName={reportBuyer.fullName || 'this buyer'}
          onClose={() => setReportBuyer(null)}
        />
      )}

    </div>
  );
}
