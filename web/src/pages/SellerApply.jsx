import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Navigate, Link } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, CheckCircle, Storefront as Store, Warning, Check, Money,
  IdentificationCard, Camera, X, FileText, User, MapPin, Wallet, Briefcase,
  Buildings, Sparkle,
} from "@phosphor-icons/react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import useAuthStore from "../store/authStore";
import PhAddressPicker from "../components/common/PhAddressPicker";
import AppLogo from "../components/AppLogo";
import resolveImg from "../lib/media";
import { uploadImage, uploadKycDocument } from "../lib/upload";
import { IMAGE_ACCEPT, uploadErrorMessage } from "../lib/uploadableImage";
import gcashLogo from "../assets/payments/gcash.svg";
import qrphLogo from "../assets/payments/qrph.svg";
import "./SellerApply.css";
import { useMunicipalities, useCategories } from '../hooks/useReferenceData';
import useFocusTrap from "../hooks/useFocusTrap";

const MAX_CATEGORIES = 5;

// What applying sends besides the payment: the shop and where it is.
const APPLY_FIELDS = [
  "shopName", "shopCategories", "shopAddress", "municipalityId", "province",
  "shopTagline", "shopDescription", "shopLogoUrl", "shopCoverUrl", "fulfillmentPreference",
];

// How buyers pay the shop. GCash and QR Ph need the account buyers pay into.
const PAYOUT_METHODS = [
  { value: "GCASH", label: "GCash", logo: gcashLogo, desc: "Buyers pay to your GCash number", numberLabel: "GCash number", numberPlaceholder: "0917 123 4567" },
  { value: "QRPH", label: "QR Ph", logo: qrphLogo, desc: "Buyers scan your bank or e-wallet QR", numberLabel: "Account number", numberPlaceholder: "Bank or e-wallet account number" },
  { value: "COD_ONLY", label: "Cash on delivery", desc: "Buyers pay in cash when they get the order" },
];
const QR_METHODS = ["GCASH", "QRPH"];

// How the seller sells. A registered business adds its permit details.
const BUSINESS_TYPES = [
  { value: "INDIVIDUAL", label: "Individual seller", desc: "Selling under your own name", Icon: User },
  { value: "REGISTERED", label: "Registered business", desc: "DTI / SEC registered", Icon: Buildings },
];


/** The picked methods in card order, known ones only. */
const orderedMethods = (list) => PAYOUT_METHODS.map((m) => m.value).filter((v) => list.includes(v));
/** The list with a method switched on or off. */
const toggleMethod = (list, method) => (list.includes(method) ? list.filter((v) => v !== method) : orderedMethods([...list, method]));
/** The online method whose account is asked for (GCash first), if any is picked. */
const accountMethodOf = (methods) => PAYOUT_METHODS.find((m) => m.value !== "COD_ONLY" && methods?.includes(m.value));
/** The main method older readers get in payoutMethod: the first online one, else cash. */
const mainMethodOf = (methods) => accountMethodOf(methods)?.value || (methods.includes("COD_ONLY") ? "COD_ONLY" : "");
/** Which kind of QR the uploaded code is: the one picked, or the only QR method chosen. */
const qrTypeOf = (form) => {
  const picked = QR_METHODS.filter((m) => form.payoutMethods.includes(m));
  return picked.includes(form.payoutQrType) ? form.payoutQrType : picked[0] || "";
};

/** A saved draft's methods: the list, or the single method an older draft holds. */
const draftMethods = (draft, fallback) => {
  const list = Array.isArray(draft.payoutMethods) ? draft.payoutMethods : (draft.payoutMethod ? [draft.payoutMethod] : []);
  // An older draft may hold Maya or Bank, which are no longer offered.
  const known = orderedMethods(list);
  return known.length ? known : fallback;
};

/** A picture to upload: the shop logo (round), cover photo (wide) or payment QR (square). */
function PictureField({ label, value, onChange, shape = "wide" }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const res = await uploadImage(file);
      onChange(res.url);
    } catch (err) {
      toast.error(uploadErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`apply-pic is-${shape}`}>
      <div className="apply-pic-frame">
        <button
          type="button"
          className="apply-pic-box"
          onClick={() => ref.current?.click()}
          disabled={busy}
          aria-label={value ? `Change ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
        >
          {value ? <img src={resolveImg(value)} alt="" /> : (
            <span className="apply-pic-empty">
              <Camera size={20} />
              {busy ? "Uploading…" : "Add"}
            </span>
          )}
        </button>
        {value && !busy && (
          <button type="button" className="apply-pic-remove" onClick={() => onChange("")} aria-label={`Remove ${label.toLowerCase()}`}>
            <X size={12} weight="bold" />
          </button>
        )}
      </div>
      <span className="apply-pic-label">{label}</span>
      <input ref={ref} type="file" accept={IMAGE_ACCEPT} hidden onChange={pick} />
    </div>
  );
}

/**
 * The business papers (permit, DTI or SEC): uploaded privately, so the preview
 * is the picked file itself, never a link back to the stored document.
 */
function PapersField({ value, onChange }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const res = await uploadKycDocument(file);
      setPreview(URL.createObjectURL(file));
      onChange(res.fileId);
    } catch (err) {
      toast.error(uploadErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="apply-pic is-wide is-papers">
      <div className="apply-pic-frame">
        <button
          type="button"
          className="apply-pic-box"
          onClick={() => ref.current?.click()}
          disabled={busy}
          aria-label={value ? "Change business papers" : "Add business papers"}
        >
          {value && preview ? <img src={preview} alt="" /> : (
            <span className="apply-pic-empty">
              {value ? <FileText size={22} /> : <Camera size={20} />}
              {busy ? "Uploading…" : value ? "Papers uploaded · tap to change" : "Add a photo of your papers"}
            </span>
          )}
        </button>
        {value && !busy && (
          <button type="button" className="apply-pic-remove" onClick={() => { setPreview(null); onChange(""); }} aria-label="Remove business papers">
            <X size={12} weight="bold" />
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept={IMAGE_ACCEPT} hidden onChange={pick} />
    </div>
  );
}

/** GCash, QR Ph and Cash on delivery as cards: the logo (or a cash icon), how buyers pay, a checkbox. Pick any. */
function PaymentMethods({ value, onToggle }) {
  return (
    <div className="apply-pay-methods" role="group" aria-labelledby="apply-pay-label">
      {PAYOUT_METHODS.map((m) => {
        const on = value.includes(m.value);
        return (
          <button
            type="button"
            key={m.value}
            role="checkbox"
            aria-checked={on}
            aria-label={`${m.label}. ${m.desc}`}
            className={`apply-pay-method${on ? " is-active" : ""}`}
            onClick={() => onToggle(m.value)}
          >
            <span className="apply-pay-method-text">
              {m.logo
                ? <img className="apply-pay-method-logo" src={m.logo} alt="" />
                : (
                  <span className="apply-pay-method-cod">
                    <span className="apply-pay-method-cod-icon"><Money size={15} weight="fill" /></span>
                    <strong>{m.label}</strong>
                  </span>
                )}
              <small>{m.desc}</small>
            </span>
            <span className="apply-pay-method-check" aria-hidden="true">
              {on && <Check size={13} weight="bold" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** A row of choices where one is on (pills). */
function Pills({ label, options, value, onChange }) {
  return (
    <div className="apply-pills" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`apply-pill${value === o.value ? " is-active" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {value === o.value && <Check size={13} weight="bold" />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Choices as cards where one is on: an icon, a name, one line on what it means, a radio dot. */
function OptionCards({ labelledBy, options, value, onChange, className = "" }) {
  return (
    <div className={`apply-options ${className}`} role="radiogroup" aria-labelledby={labelledBy}>
      {options.map(({ value: optionValue, label, desc, Icon }) => {
        const on = value === optionValue;
        return (
          <button
            type="button"
            key={optionValue}
            role="radio"
            aria-checked={on}
            className={`apply-pay-method apply-option${on ? " is-active" : ""}`}
            onClick={() => onChange(optionValue)}
          >
            <span className="apply-option-icon" aria-hidden="true"><Icon size={18} weight="fill" /></span>
            <span className="apply-pay-method-text">
              <strong className="apply-option-label">{label}</strong>
              <small>{desc}</small>
            </span>
            <span className="apply-option-radio" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

/** A numbered part of the form: the step, a friendly title, one line on why, an icon. */
function SectionHead({ step, title, Icon, children }) {
  return (
    <div className="apply-section-head">
      <span className="apply-step-num" aria-hidden="true">{step}</span>
      <div>
        <h2>{title}</h2>
        <p>{children}</p>
      </div>
      <Icon size={22} weight="fill" className="apply-section-icon" aria-hidden="true" />
    </div>
  );
}

/** Same brand lockup as the Seller Center sidebar. */
function ApplyBrandHeader() {
  return (
    <header className="apply-brand-bar">
      <div className="apply-brand-inner">
        <Link to="/sell" className="apply-brand">
          <AppLogo className="apply-brand-logo" alt="" />
          <span className="apply-brand-text">
            <strong>Emoorm</strong>
            <span>Seller Center</span>
          </span>
        </Link>
        <Link to="/sell" className="apply-brand-back">
          <ArrowLeft size={15} /> <span>Back to seller info</span>
        </Link>
      </div>
    </header>
  );
}

/** The contact number is required to apply, so it is fixed here, not in Settings. */
function ContactNumberField({ value, onSaved }) {
  const [editing, setEditing] = useState(!value);
  const [draft, setDraft] = useState(value || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const contactNumber = draft.trim();
    if (!/^(\+63|0)?[0-9]{10}$/.test(contactNumber)) {
      toast.error("Enter a valid Philippine mobile number, e.g. 09171234567");
      return;
    }
    setSaving(true);
    try {
      const res = await axios.put("/auth/profile", { contactNumber });
      onSaved(res.data?.contactNumber || contactNumber);
      setEditing(false);
      toast.success("Contact number saved");
    } catch (err) {
      toast.error(err.message || "Could not save your contact number");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="apply-info-row">
        <span>Contact number</span>
        <strong>
          {value}
          <button type="button" className="apply-inline-edit" onClick={() => setEditing(true)}>Change</button>
        </strong>
      </div>
    );
  }

  return (
    <div className="apply-field">
      <label htmlFor="apply-contact">Contact number <span className="req">*</span></label>
      <div className="apply-inline-field">
        <input
          id="apply-contact"
          type="tel"
          autoComplete="tel"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="09171234567"
          className={!value ? "input-error" : ""}
        />
        <button type="button" className="apply-inline-save" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

const EMPTY_FORM = {
  shopName: "",
  shopTagline: "",
  shopDescription: "",
  shopLogoUrl: "",
  shopCoverUrl: "",
  shopCategories: [],
  shopAddress: "",
  // Structured address parts (composed into shopAddress on change)
  province: "Oriental Mindoro",
  provinceCode: "",
  municipalityId: "",
  municipalityName: "",
  municipalityCode: "",
  barangay: "",
  barangayCode: "",
  street: "",
  sellerBusinessType: "INDIVIDUAL",
  sellerPermitNumber: "",
  sellerPermitUrl: "",
  sellerBirTin: "",
  payoutMethods: ["GCASH"],
  payoutAccountName: "",
  payoutAccountNumber: "",
  payoutQrUrl: "",
  payoutQrType: "",
  fulfillmentPreference: "DELIVERY",
};

export default function SellerApply() {
  const { isAuthenticated, user, updateUser } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Set once this page's application goes through: the account is a seller
  // from then on, and goes to the guided setup rather than the Seller Center.
  const [applied, setApplied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useFocusTrap(confirming, { onClose: () => setConfirming(false) });

  // The municipality is deliberately NOT pre-filled from the profile: the
  // picker would show nothing while the form quietly carried the account's own
  // municipality, and that is the one field that decides who reviews the shop.
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    province: user?.province || "Oriental Mindoro",
    barangay: user?.barangay || "",
    street: user?.address || "",
    payoutAccountName: user?.fullName || "",
    payoutAccountNumber: user?.contactNumber || "",
  }));

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [contactNumber, setContactNumber] = useState(user?.contactNumber || "");

  // Server-held application state: status, rejection reason, saved draft.
  const [application, setApplication] = useState(null);
  const [loadingApplication, setLoadingApplication] = useState(true);

  const { municipalities: dbMunicipalities, isLoading: dbMunicipalitiesLoading } = useMunicipalities();
  const { categories } = useCategories();

  const [errors, setErrors] = useState({});

  useEffect(() => {
    let cancelled = false;
    axios.get("/auth/seller-application")
      .then((r) => {
        if (cancelled) return;
        setApplication(r.data || null);
        const draft = r.data?.draft;
        if (draft) {
          setForm((prev) => ({
            ...prev,
            ...draft,
            shopCategories: Array.isArray(draft.shopCategories) ? draft.shopCategories : prev.shopCategories,
            payoutMethods: draftMethods(draft, prev.payoutMethods),
            payoutMethod: undefined,
            fulfillmentPreference: draft.fulfillmentPreference || prev.fulfillmentPreference,
          }));
        }
      })
      .catch(() => { })
      .finally(() => { if (!cancelled) setLoadingApplication(false); });
    return () => { cancelled = true; };
  }, []);

  const status = application?.status ?? user?.sellerApplicationStatus ?? null;

  // ── Draft autosave ──────────────────────────────────────────────────
  const savedDraftRef = useRef("");
  useEffect(() => {
    if (loadingApplication || status === "PENDING") return undefined;
    const payload = {};
    for (const [key, value] of Object.entries(form)) {
      if (Array.isArray(value) ? value.length : value) payload[key] = value;
    }
    const serialized = JSON.stringify(payload);
    if (serialized === savedDraftRef.current || serialized === "{}") return undefined;

    const timer = setTimeout(() => {
      savedDraftRef.current = serialized;
      axios.put("/auth/seller-application/draft", { draft: payload }).catch(() => { });
    }, 1500);
    return () => clearTimeout(timer);
  }, [form, loadingApplication, status]);

  const set = useCallback((key, val) => {
    setForm((p) => ({ ...p, [key]: val }));
    setErrors((p) => (p[key] ? { ...p, [key]: "" } : p));
  }, []);

  const toggleCategory = (id) => {
    setForm((p) => {
      const has = p.shopCategories.includes(id);
      if (!has && p.shopCategories.length >= MAX_CATEGORIES) {
        toast.error(`Pick up to ${MAX_CATEGORIES} categories`);
        return p;
      }
      return {
        ...p,
        shopCategories: has
          ? p.shopCategories.filter((c) => c !== id)
          : [...p.shopCategories, id],
      };
    });
    setErrors((p) => (p.shopCategories ? { ...p, shopCategories: "" } : p));
  };

  /** Same rules the server enforces, so problems surface as you type. */
  const fieldError = useCallback((key, value, current) => {
    switch (key) {
      case "shopName": {
        const name = (value || "").trim();
        if (!name) return "Shop name is required";
        if (name.length < 3) return "Use at least 3 characters";
        if (name.length > 60) return "Use 60 characters or fewer";
        return "";
      }
      case "shopTagline":
        return (value || "").length > 80 ? "Use 80 characters or fewer" : "";
      case "shopDescription":
        return (value || "").length > 1000 ? "Use 1000 characters or fewer" : "";
      case "shopAddress":
        return (value || "").trim() ? "" : "Complete your shop address";
      case "municipalityId":
        return value ? "" : "Select the municipality your shop is in";
      case "shopCategories":
        return value?.length ? "" : "Pick at least one category";
      case "payoutMethods":
        return value?.length ? "" : "Pick at least one way buyers pay";
      case "payoutAccountName":
        return accountMethodOf(current?.payoutMethods) && !(value || "").trim()
          ? "Account name is required" : "";
      case "payoutAccountNumber": {
        const account = accountMethodOf(current?.payoutMethods);
        return account && !(value || "").trim() ? `${account.numberLabel} is required` : "";
      }
      case "sellerPermitNumber":
        if (current?.sellerBusinessType !== "REGISTERED") return "";
        if (!(value || "").trim()) return "Permit or registration number is required";
        return value.trim().length > 60 ? "Use 60 characters or fewer" : "";
      case "sellerBirTin":
        return current?.sellerBusinessType === "REGISTERED" && (value || "").trim().length > 30
          ? "Use 30 characters or fewer" : "";
      default:
        return "";
    }
  }, []);

  const touch = (key) => {
    const message = fieldError(key, form[key], form);
    setErrors((p) => ({ ...p, [key]: message }));
  };

  const validateAll = () => {
    const keys = ["shopName", "shopDescription", "shopAddress", "municipalityId", "shopCategories", "sellerPermitNumber", "sellerBirTin", "payoutMethods", "payoutAccountName", "payoutAccountNumber"];
    const errs = {};
    for (const key of keys) {
      const message = fieldError(key, form[key], form);
      if (message) errs[key] = message;
    }
    setErrors(errs);
    return errs;
  };

  const account = accountMethodOf(form.payoutMethods);
  const registered = form.sellerBusinessType === "REGISTERED";
  const qrType = qrTypeOf(form);
  const bothQr = QR_METHODS.every((m) => form.payoutMethods.includes(m));
  // Just a count for the preview ("3 items left"): the fields themselves say
  // what is wrong once the seller tries to submit.
  const itemsLeft = useMemo(() => [
    !contactNumber,
    !form.shopName.trim(),
    !form.shopCategories.length,
    !form.shopAddress.trim() || !form.municipalityId,
    registered && !form.sellerPermitNumber.trim(),
    !form.payoutMethods.length,
    account && (!form.payoutAccountName.trim() || !form.payoutAccountNumber.trim()),
    !acceptedTerms,
  ].filter(Boolean).length, [form, contactNumber, acceptedTerms, account, registered]);

  const submit = async () => {
    setConfirming(false);
    setIsSubmitting(true);
    try {
      // Only what this form asks for (and shop details an older draft may
      // hold). Business details come in the guided setup.
      const extras = Object.fromEntries(APPLY_FIELDS
        .map((key) => [key, form[key]])
        .filter(([, v]) => (Array.isArray(v) ? v.length : v)));
      const res = await axios.post("/auth/apply-seller", {
        ...extras,
        payoutMethods: form.payoutMethods,
        payoutMethod: mainMethodOf(form.payoutMethods),
        ...(!account ? {} : {
          payoutAccountName: form.payoutAccountName.trim(),
          payoutAccountNumber: form.payoutAccountNumber.trim(),
          ...(qrType && form.payoutQrUrl ? { payoutQrUrl: form.payoutQrUrl, payoutQrType: qrType } : {}),
        }),
        sellerBusinessType: registered ? "REGISTERED" : "INDIVIDUAL",
        ...(!registered ? {} : {
          sellerPermitNumber: form.sellerPermitNumber.trim(),
          sellerBirTin: form.sellerBirTin.trim(),
          sellerPermitUrl: form.sellerPermitUrl,
        }),
        shopMunicipalityId: form.municipalityId,
        shopBarangay: form.barangay,
        acceptedTerms: true,
      });
      const updated = res?.data ?? res;
      setApplied(true);
      // The account is a seller now: the shop is set up and private until an
      // admin approves the application, so the Seller Center opens straight away.
      updateUser({
        ...user,
        ...(updated || {}),
        role: updated?.role || "SELLER",
        sellerApplicationStatus: updated?.sellerApplicationStatus || "PENDING",
      });
    } catch (err) {
      toast.error(err.message || "Submission failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = () => {
    const errs = validateAll();
    if (Object.keys(errs).length > 0) {
      toast.error("Please complete the highlighted fields");
      requestAnimationFrame(() => {
        document.querySelector(".input-error, .field-error")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }
    if (!contactNumber) {
      toast.error("Add a contact number before applying");
      return;
    }
    if (!acceptedTerms) {
      toast.error("Please accept the Seller Terms of Service");
      return;
    }
    // Submitting notifies the municipal admin and cannot be taken back.
    setConfirming(true);
  };

  if (!isAuthenticated) return <Navigate to="/seller/login?redirect=/seller/apply" replace />;
  // Next after applying: the guided setup, step by step (every step can wait).
  if (user?.role === "SELLER") return <Navigate to={applied ? "/seller/welcome" : "/seller"} replace />;

  if (status === "PENDING") {
    return (
      <div className="apply-page">
        <ApplyBrandHeader />
        <main className="apply-column">
          <div className="apply-status">
            <CheckCircle size={52} weight="fill" className="apply-status-icon" />
            <h1>Application under review</h1>
            <p>
              The municipal admin is checking your details. We&apos;ll notify you once
              there&apos;s a decision (usually 1–2 business days).
            </p>
            {application?.submittedAt && (
              <p className="apply-status-meta">
                Submitted {new Date(application.submittedAt).toLocaleDateString("en-PH", {
                  year: "numeric", month: "long", day: "numeric",
                })}
              </p>
            )}
            <Link to="/" className="apply-back-btn">Back to shop</Link>
          </div>
        </main>
      </div>
    );
  }

  const reviewer = form.municipalityName ? `${form.municipalityName} admin` : "Pick your town";
  const buyersPay = form.payoutMethods.length
    ? form.payoutMethods.map((m) => PAYOUT_METHODS.find((p) => p.value === m)?.label).filter(Boolean).join(", ")
    : "—";

  return (
    <div className="apply-page">
      <ApplyBrandHeader />

      {status === "REJECTED" && (
        <div className="apply-shell apply-shell--notice">
          <div className="apply-reject">
            <Warning size={20} weight="fill" />
            <div>
              <strong>Your previous application was not approved</strong>
              {application?.rejectionReason && <p>{application.rejectionReason}</p>}
              <p>Fix that and submit again. The details you entered are still here.</p>
            </div>
          </div>
        </div>
      )}

      <div className="apply-shell">
        <main className="apply-main">
          <div className="apply-intro">
            <h1>Open your shop</h1>
            <p>Five short steps, about two minutes. Your shop goes live once your municipal admin approves it.</p>
          </div>

          {/* ── 1 · You ── */}
          <section className="apply-section">
            <SectionHead step={1} title="About you" Icon={User}>
              How the admin and your buyers can reach you.
            </SectionHead>
            <div className="apply-info">
              <div className="apply-info-row"><span>Name</span><strong>{user?.fullName || "—"}</strong></div>
              <div className="apply-info-row"><span>Email</span><strong>{user?.email || "—"}</strong></div>
              <ContactNumberField
                value={contactNumber}
                onSaved={(next) => {
                  setContactNumber(next);
                  updateUser({ ...user, contactNumber: next });
                }}
              />
            </div>
          </section>

          {/* ── 2 · The shop ── */}
          <section className="apply-section">
            <SectionHead step={2} title="Your shop" Icon={Store}>
              Its name and what it sells. You can change these later.
            </SectionHead>
            <div className="apply-form">
              <div className="apply-field">
                <label htmlFor="apply-shop-name">Shop name <span className="req">*</span></label>
                <input
                  id="apply-shop-name"
                  type="text"
                  value={form.shopName}
                  onChange={(e) => set("shopName", e.target.value)}
                  onBlur={() => touch("shopName")}
                  placeholder="e.g. Maria's Fresh Farm"
                  maxLength={60}
                  className={errors.shopName ? "input-error" : ""}
                />
                {errors.shopName
                  ? <span className="field-error" role="alert">{errors.shopName}</span>
                  : <span className="field-hint">{form.shopName.length}/60 · must be unique on Emoorm</span>}
              </div>

              <div className="apply-field">
                <span className="apply-field-label">What do you sell? <span className="req">*</span></span>
                <div className={`apply-chips${errors.shopCategories ? " input-error" : ""}`}>
                  {categories.length === 0 && <span className="field-hint">Loading categories…</span>}
                  {categories.map((c) => {
                    const active = form.shopCategories.includes(c.id);
                    return (
                      <button
                        type="button"
                        key={c.id}
                        className={`apply-chip${active ? " is-active" : ""}`}
                        aria-pressed={active}
                        onClick={() => toggleCategory(c.id)}
                      >
                        {active && <Check size={13} weight="bold" />}
                        {c.name}
                      </button>
                    );
                  })}
                </div>
                {errors.shopCategories
                  ? <span className="field-error" role="alert">{errors.shopCategories}</span>
                  : <span className="field-hint">Pick up to {MAX_CATEGORIES}. This is where your products appear.</span>}
              </div>
            </div>
          </section>

          {/* ── 3 · Where ── */}
          <section className="apply-section">
            <SectionHead step={3} title="Where your shop is" Icon={MapPin}>
              The town you pick decides which municipal admin reviews your shop.
            </SectionHead>
            <div className="apply-form">
              <div className="apply-field">
                <PhAddressPicker
                  value={{
                    province: form.province,
                    provinceCode: form.provinceCode,
                    municipalityId: form.municipalityId,
                    municipalityName: form.municipalityName,
                    municipalityCode: form.municipalityCode,
                    barangay: form.barangay,
                    barangayCode: form.barangayCode,
                    street: form.street,
                  }}
                  onChange={(next) => {
                    setForm((prev) => {
                      const merged = { ...prev, ...next };
                      const composed = [merged.street, merged.barangay, merged.municipalityName, merged.province]
                        .map((v) => (v || "").trim())
                        .filter(Boolean)
                        .join(", ");
                      return { ...merged, shopAddress: composed };
                    });
                    setErrors((prev) => ({ ...prev, shopAddress: "", municipalityId: "" }));
                  }}
                  dbMunicipalities={dbMunicipalities}
                  dbLoading={dbMunicipalitiesLoading}
                  errors={{
                    province: errors.shopAddress,
                    municipalityId: errors.shopAddress || errors.municipalityId,
                    barangay: errors.shopAddress,
                    street: errors.shopAddress,
                  }}
                />
                {(errors.shopAddress || errors.municipalityId) && (
                  <span className="field-error" role="alert">{errors.shopAddress || errors.municipalityId}</span>
                )}
              </div>
            </div>
          </section>

          {/* ── 4 · Selling as ── */}
          <section className="apply-section">
            <SectionHead step={4} title="Selling as" Icon={Briefcase}>
              Registered businesses add their permit. Selling under your own name? Nothing more needed.
            </SectionHead>
            <div className="apply-form">
              <span className="apply-sr-only" id="apply-type-label">How do you sell?</span>
              <OptionCards
                labelledBy="apply-type-label"
                className="apply-types"
                options={BUSINESS_TYPES}
                value={form.sellerBusinessType || "INDIVIDUAL"}
                onChange={(value) => {
                  set("sellerBusinessType", value);
                  setErrors((p) => ({ ...p, sellerPermitNumber: "", sellerBirTin: "" }));
                }}
              />

              {registered && (
                <>
                  <div className="apply-field">
                    <label htmlFor="apply-permit">Permit or registration number <span className="req">*</span></label>
                    <input
                      id="apply-permit"
                      type="text"
                      value={form.sellerPermitNumber}
                      onChange={(e) => set("sellerPermitNumber", e.target.value)}
                      onBlur={() => touch("sellerPermitNumber")}
                      placeholder="DTI, SEC or business permit no."
                      maxLength={60}
                      className={errors.sellerPermitNumber ? "input-error" : ""}
                    />
                    {errors.sellerPermitNumber && <span className="field-error" role="alert">{errors.sellerPermitNumber}</span>}
                  </div>
                  <div className="apply-field">
                    <span className="apply-field-label">Business permit / DTI / SEC papers</span>
                    <PapersField value={form.sellerPermitUrl} onChange={(id) => set("sellerPermitUrl", id)} />
                    <span className="field-hint">Optional · a clear photo or scan. Only the reviewing admin sees it.</span>
                  </div>
                  <div className="apply-field">
                    <label htmlFor="apply-tin">BIR TIN</label>
                    <input
                      id="apply-tin"
                      type="text"
                      value={form.sellerBirTin}
                      onChange={(e) => set("sellerBirTin", e.target.value)}
                      onBlur={() => touch("sellerBirTin")}
                      placeholder="000-000-000-000"
                      maxLength={30}
                      className={errors.sellerBirTin ? "input-error" : ""}
                    />
                    {errors.sellerBirTin
                      ? <span className="field-error" role="alert">{errors.sellerBirTin}</span>
                      : <span className="field-hint">Optional</span>}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* ── 5 · How buyers pay ── */}
          <section className="apply-section">
            <SectionHead step={5} title="How buyers pay" Icon={Wallet}>
              Where your buyers&apos; payments go. You can change it later.
            </SectionHead>
            <div className="apply-form">
              <div className="apply-field">
                <span className="apply-sr-only" id="apply-pay-label">Payment methods</span>
                <PaymentMethods
                  value={form.payoutMethods}
                  onToggle={(method) => {
                    setForm((p) => ({ ...p, payoutMethods: toggleMethod(p.payoutMethods, method) }));
                    setErrors((p) => ({ ...p, payoutMethods: "", payoutAccountName: "", payoutAccountNumber: "" }));
                  }}
                />
                {errors.payoutMethods
                  ? <span className="field-error" role="alert">{errors.payoutMethods}</span>
                  : <span className="field-hint">Pick all that apply. You can change these anytime in Seller Center.</span>}
              </div>

              {account && (
                <>
                  <div className="apply-pay-grid">
                    <div className="apply-field">
                      <label htmlFor="apply-pay-name">Account name <span className="req">*</span></label>
                      <input
                        id="apply-pay-name"
                        type="text"
                        value={form.payoutAccountName}
                        onChange={(e) => set("payoutAccountName", e.target.value)}
                        onBlur={() => touch("payoutAccountName")}
                        placeholder="Name on the account"
                        autoComplete="name"
                        className={errors.payoutAccountName ? "input-error" : ""}
                      />
                      {errors.payoutAccountName && <span className="field-error" role="alert">{errors.payoutAccountName}</span>}
                    </div>
                    <div className="apply-field">
                      <label htmlFor="apply-pay-number">
                        {account.numberLabel} <span className="req">*</span>
                      </label>
                      <input
                        id="apply-pay-number"
                        type="tel"
                        inputMode="numeric"
                        value={form.payoutAccountNumber}
                        onChange={(e) => set("payoutAccountNumber", e.target.value)}
                        onBlur={() => touch("payoutAccountNumber")}
                        placeholder={account.numberPlaceholder}
                        className={errors.payoutAccountNumber ? "input-error" : ""}
                      />
                      {errors.payoutAccountNumber && <span className="field-error" role="alert">{errors.payoutAccountNumber}</span>}
                    </div>
                  </div>
                  <div className="apply-field">
                    <span className="apply-field-label">Your QR code <span className="apply-optional">(optional)</span></span>
                    <div className="apply-qr">
                      <PictureField shape="square" label="QR code" value={form.payoutQrUrl} onChange={(url) => set("payoutQrUrl", url)} />
                      <div className="apply-qr-text">
                        {bothQr && (
                          <Pills
                            label="This QR is for"
                            options={QR_METHODS.map((m) => ({ value: m, label: PAYOUT_METHODS.find((p) => p.value === m).label }))}
                            value={qrType}
                            onChange={(value) => set("payoutQrType", value)}
                          />
                        )}
                        <span className="field-hint">
                          Your {bothQr ? "GCash or QR Ph" : PAYOUT_METHODS.find((p) => p.value === qrType)?.label} QR, so buyers can scan to pay. You can add it later.
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* The ID check comes later, in the Seller Center (/seller/verification). */}
          <section className="apply-later" aria-label="Identity verification">
            <IdentificationCard size={22} weight="fill" />
            <div>
              <strong>Verify your identity later</strong>
              <p>After you apply, verify your ID from your Seller Center. It takes a minute and helps the admin approve your shop faster.</p>
            </div>
          </section>

          {/* What comes after: the guided setup. */}
          <section className="apply-next" aria-label="After you apply">
            <Sparkle size={20} weight="fill" />
            <div>
              <strong>After you apply</strong>
              <p>A short guided setup: your logo and cover, a few words about your shop, how buyers get their orders, and your first product.</p>
            </div>
          </section>
        </main>

        {/* ── Live preview, stays in view while scrolling ── */}
        <aside className="apply-aside">
          <div className="apply-preview">
            <div className="apply-preview-head">
              <h3>Application preview</h3>
              <span className={itemsLeft === 0 ? "is-ready" : ""}>
                {itemsLeft === 0 ? "Ready to submit" : `${itemsLeft} item${itemsLeft === 1 ? "" : "s"} left`}
              </span>
            </div>

            <div className="apply-preview-card">
              <div className="apply-preview-cover" />
              <div className="apply-preview-shop">
                <span className="apply-preview-logo apply-preview-avatar">
                  {(form.shopName.trim() || "S").charAt(0).toUpperCase()}
                </span>
                <span className="apply-preview-shop-text">
                  <strong>{form.shopName.trim() || "Your shop name"}</strong>
                  <span>{form.shopAddress || "Shop address"}</span>
                </span>
              </div>
              {form.shopCategories.length > 0 && (
                <div className="apply-preview-cats">
                  {form.shopCategories.map((id) => {
                    const category = categories.find((c) => c.id === id);
                    return category ? <span key={id}>{category.name}</span> : null;
                  })}
                </div>
              )}
            </div>

            <dl className="apply-preview-list">
              <dt>Applicant</dt>
              <dd>{user?.fullName || "—"}</dd>
              <dt>Contact</dt>
              <dd>{contactNumber || "—"}</dd>
              <dt>Selling as</dt>
              <dd>{registered ? "Registered business" : "Individual seller"}</dd>
              <dt>Buyers pay</dt>
              <dd>{buyersPay}</dd>
              <dt>Reviewed by</dt>
              <dd>{reviewer}</dd>
            </dl>

            <label className="apply-terms-check">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
              />
              <span>
                I confirm the information above is accurate and I agree to Emoorm&apos;s{" "}
                <Link to="/terms" target="_blank" rel="noreferrer">Seller Terms of Service</Link>.
              </span>
            </label>

            <button
              type="button"
              className="apply-btn-submit"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting…" : "Open my shop"}
              {!isSubmitting && <ArrowRight size={16} />}
            </button>
            <p className="apply-draft-note">Your progress is saved automatically.</p>
          </div>
        </aside>
      </div>

      {confirming && (
        <div className="apply-confirm-backdrop" onClick={() => setConfirming(false)}>
          <div className="apply-confirm" role="dialog" aria-modal="true" ref={confirmRef} onClick={(e) => e.stopPropagation()}>
            <h3>Open your shop?</h3>
            <p>
              The {form.municipalityName || "municipal"} admin will be notified and will review your
              shop. Meanwhile you can set it up and add products.
            </p>
            <div className="apply-confirm-actions">
              <button type="button" className="apply-confirm-cancel" onClick={() => setConfirming(false)}>
                Keep editing
              </button>
              <button type="button" className="apply-confirm-go" onClick={submit} disabled={isSubmitting}>
                {isSubmitting ? "Submitting…" : "Yes, submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
