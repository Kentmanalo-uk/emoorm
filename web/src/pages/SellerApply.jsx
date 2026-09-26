import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Navigate, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, CheckCircle, UploadSimple as Upload, X, User,
  Storefront as Store, ShieldCheck, Warning, Buildings, Wallet, Check,
} from "@phosphor-icons/react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import useAuthStore from "../store/authStore";
import PhAddressPicker from "../components/common/PhAddressPicker";
import AppLogo from "../components/AppLogo";
import { inspectImage } from "../lib/imageQuality";
import { IDENTITY_VERIFICATION_PATH } from "../lib/identity";
import IdentityVerifier from "../components/identity/IdentityVerifier";
import resolveImg from "../lib/media";
import "./SellerApply.css";
import { useMunicipalities, useCategories } from '../hooks/useReferenceData';

const ID_TYPES = [
  "Philippine Statistics Authority (PhilSys) National ID",
  "Passport",
  "Driver License (LTO)",
  "PRC Professional ID",
  "SSS / GSIS ID",
  "Unified Multi-Purpose ID (UMID)",
  "Voter ID",
  "Postal ID",
  "PhilHealth ID",
  "Barangay ID",
];

const BUSINESS_TYPES = [
  { value: "INDIVIDUAL", label: "Individual seller", hint: "Selling under your own name" },
  { value: "REGISTERED", label: "Registered business", hint: "DTI / SEC registered" },
];

const PAYOUT_METHODS = [
  { value: "GCASH", label: "GCash" },
  { value: "MAYA", label: "Maya" },
  { value: "BANK", label: "Bank transfer" },
  { value: "COD_ONLY", label: "Cash on delivery only" },
];

const FULFILLMENT_OPTIONS = [
  { value: "DELIVERY", label: "Deliver to buyers" },
  { value: "PICKUP", label: "Buyers pick up" },
  { value: "BOTH", label: "Both" },
];

const MAX_CATEGORIES = 5;

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
          <ArrowLeft size={15} /> Back to seller info
        </Link>
      </div>
    </header>
  );
}

function UploadBox({ label, hint, fileId, previewUrl, onChange, required, endpoint = "/upload/kyc" }) {
  const ref = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (ref.current) ref.current.value = "";
    if (!file) return;

    // Catch the photos admins would have rejected anyway, before uploading.
    const quality = await inspectImage(file);
    if (!quality.ok) {
      toast.error(quality.error);
      return;
    }
    if (quality.warning) toast(quality.warning, { icon: "⚠️", duration: 6000 });

    // Preview locally from the selected file — never round-trips a fetchable
    // URL to this sensitive document, unlike the old public /uploads path.
    const localPreview = URL.createObjectURL(file);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await axios.post(endpoint, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onChange(res.data.fileId || res.data.url, localPreview);
      toast.success("Photo uploaded");
    } catch (err) {
      URL.revokeObjectURL(localPreview);
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    onChange("", null);
  };

  return (
    <div className="upload-box" onClick={() => !fileId && ref.current?.click()}>
      <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
      {fileId ? (
        <div className="upload-preview">
          {previewUrl && <img src={previewUrl} alt={label} />}
          <button
            type="button"
            className="upload-remove"
            onClick={handleRemove}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="upload-empty">
          {uploading ? (
            <span className="upload-loading">Uploading…</span>
          ) : (
            <>
              <Upload size={24} className="upload-icon" />
              <p className="upload-label">{label}{required && " *"}</p>
              <p className="upload-hint">{hint}</p>
            </>
          )}
        </div>
      )}
    </div>
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
        <span>Contact Number</span>
        <strong>
          {value}
          <button type="button" className="apply-inline-edit" onClick={() => setEditing(true)}>Change</button>
        </strong>
      </div>
    );
  }

  return (
    <div className="apply-info-row apply-info-row--edit">
      <span>Contact Number <span className="req">*</span></span>
      <div className="apply-inline-field">
        <input
          type="tel"
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
  payoutMethod: "GCASH",
  payoutAccountName: "",
  payoutAccountNumber: "",
  fulfillmentPreference: "DELIVERY",
  idType: "",
  idFrontUrl: "",
  idBackUrl: "",
};

export default function SellerApply() {
  const { isAuthenticated, user, updateUser } = useAuthStore();
  const navigate = useNavigate();
  // Set when the ID passes the OCR check on this page.
  const [verifiedHere, setVerifiedHere] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);

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

  // Local-only object URLs for the photo previews (never sent to the server).
  const [previews, setPreviews] = useState({ idFrontUrl: null, idBackUrl: null, sellerPermitUrl: null });
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
          }));
        }
      })
      .catch(() => { })
      .finally(() => { if (!cancelled) setLoadingApplication(false); });
    return () => { cancelled = true; };
  }, []);

  const status = application?.status ?? user?.sellerApplicationStatus ?? null;
  const identityVerified = application?.identityVerified === true || verifiedHere;

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

  const setUpload = (key, fileId, previewUrl) => {
    set(key, fileId);
    setPreviews((p) => ({ ...p, [key]: previewUrl }));
  };

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
      case "idType":
        return value ? "" : "Please select an ID type";
      case "idFrontUrl":
        return value ? "" : "Front photo of ID is required";
      case "idBackUrl":
        return value ? "" : "Back photo of ID is required";
      case "payoutAccountName":
        return current?.payoutMethod && current.payoutMethod !== "COD_ONLY" && !(value || "").trim()
          ? "Account name is required" : "";
      case "payoutAccountNumber":
        return current?.payoutMethod && current.payoutMethod !== "COD_ONLY" && !(value || "").trim()
          ? "Account number is required" : "";
      case "sellerPermitNumber":
        return current?.sellerBusinessType === "REGISTERED" && !(value || "").trim()
          ? "Permit or registration number is required" : "";
      default:
        return "";
    }
  }, []);

  const touch = (key) => {
    const message = fieldError(key, form[key], form);
    setErrors((p) => ({ ...p, [key]: message }));
  };

  const validateAll = () => {
    const keys = [
      "shopName", "shopTagline", "shopDescription", "shopAddress", "municipalityId",
      "shopCategories", "payoutAccountName", "payoutAccountNumber", "sellerPermitNumber",
    ];
    const errs = {};
    for (const key of keys) {
      const message = fieldError(key, form[key], form);
      if (message) errs[key] = message;
    }
    setErrors(errs);
    return errs;
  };

  const missing = useMemo(() => [
    !form.shopName.trim() && "Shop name",
    !form.shopAddress.trim() && "Shop address",
    !form.shopCategories.length && "Shop categories",
    form.sellerBusinessType === "REGISTERED" && !form.sellerPermitNumber.trim() && "Permit number",
    form.payoutMethod !== "COD_ONLY" && !form.payoutAccountNumber.trim() && "Payout details",
    !identityVerified && "Verify your ID",
    !contactNumber && "Contact number",
    !acceptedTerms && "Accept the seller terms",
  ].filter(Boolean), [form, identityVerified, contactNumber, acceptedTerms]);

  const submit = async () => {
    setConfirming(false);
    setIsSubmitting(true);
    try {
      const res = await axios.post("/auth/apply-seller", {
        ...form,
        shopMunicipalityId: form.municipalityId,
        shopBarangay: form.barangay,
        acceptedTerms: true,
      });
      const updated = res?.data ?? res;
      // The account is a seller now: the shop is set up and private until an
      // admin approves the application, so the Seller Center opens straight away.
      updateUser({
        ...user,
        ...(updated || {}),
        role: updated?.role || "SELLER",
        sellerApplicationStatus: updated?.sellerApplicationStatus || "PENDING",
      });
      toast.success("Application submitted. Set up your shop while it's reviewed.");
      navigate("/seller", { replace: true });
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
    if (!identityVerified) {
      toast.error("Verify your ID first");
      document.getElementById("apply-identity")?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  if (!isAuthenticated) return <Navigate to="/login?redirect=/seller/apply" replace />;
  if (user?.role === "SELLER") return <Navigate to="/seller" replace />;

  if (status === "PENDING") {
    return (
      <div className="apply-page">
        <ApplyBrandHeader />
        <div className="apply-card apply-card-status">
          <CheckCircle size={56} className="apply-status-icon apply-status-icon--pending" />
          <h2>Application Under Review</h2>
          <p>
            Your seller application has been submitted and is being reviewed by the
            municipal admin. We'll notify you once there's a decision (usually 1–2 business days).
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
      </div>
    );
  }

  const thumbs = [previews.idFrontUrl, previews.idBackUrl, previews.sellerPermitUrl].filter(Boolean);
  const isRegistered = form.sellerBusinessType === "REGISTERED";
  const needsPayoutAccount = form.payoutMethod !== "COD_ONLY";

  return (
    <div className="apply-page">
      <ApplyBrandHeader />

      {status === "REJECTED" && (
        <div className="apply-shell apply-shell--notice">
          <div className="apply-reject">
            <Warning size={22} weight="fill" />
            <div>
              <strong>Your previous application was not approved.</strong>
              {application?.rejectionReason && <p>{application.rejectionReason}</p>}
              <span>Fix that and submit again — the details you entered are still here.</span>
            </div>
          </div>
        </div>
      )}

      <div className="apply-shell">
        <div className="apply-main">
          {/* ── Personal information ── */}
          <section className="apply-card apply-section">
            <div className="apply-section-head">
              <User size={22} />
              <div>
                <h2>Personal Information</h2>
                <p>We'll use your account details for verification. Update your profile if anything is outdated.</p>
              </div>
            </div>
            <div className="apply-info-grid">
              <div className="apply-info-row"><span>Full Name</span><strong>{user?.fullName || "—"}</strong></div>
              <div className="apply-info-row"><span>Email</span><strong>{user?.email || "—"}</strong></div>
              <ContactNumberField
                value={contactNumber}
                onSaved={(next) => {
                  setContactNumber(next);
                  updateUser({ ...user, contactNumber: next });
                }}
              />
              <div className="apply-info-row"><span>Address</span>
                <strong className={!user?.address ? "apply-missing" : ""}>
                  {[user?.address, user?.barangay, user?.municipality?.name].filter(Boolean).join(", ") || "Not set"}
                </strong>
              </div>
            </div>
          </section>

          {/* ── Shop details ── */}
          <section className="apply-card apply-section">
            <div className="apply-section-head">
              <Store size={22} />
              <div>
                <h2>Shop Details</h2>
                <p>This is what buyers see. Your storefront goes live with these details once approved.</p>
              </div>
            </div>

            <div className="apply-form">
              <div className="apply-field">
                <label>Shop / Store Name <span className="req">*</span></label>
                <input
                  type="text"
                  value={form.shopName}
                  onChange={(e) => set("shopName", e.target.value)}
                  onBlur={() => touch("shopName")}
                  placeholder="e.g. Maria's Fresh Farm"
                  maxLength={60}
                  className={errors.shopName ? "input-error" : ""}
                />
                {errors.shopName
                  ? <span className="field-error">{errors.shopName}</span>
                  : <span className="field-hint">{form.shopName.length}/60 — must be unique across Emoorm</span>}
              </div>

              <div className="apply-field">
                <label>Tagline</label>
                <input
                  type="text"
                  value={form.shopTagline}
                  onChange={(e) => set("shopTagline", e.target.value)}
                  onBlur={() => touch("shopTagline")}
                  placeholder="e.g. Farm-fresh calamansi, picked daily"
                  maxLength={80}
                  className={errors.shopTagline ? "input-error" : ""}
                />
                {errors.shopTagline && <span className="field-error">{errors.shopTagline}</span>}
              </div>

              <div className="apply-field">
                <label>Shop Categories <span className="req">*</span></label>
                <div className={`apply-chips${errors.shopCategories ? " input-error" : ""}`}>
                  {categories.length === 0 && <span className="field-hint">Loading categories…</span>}
                  {categories.map((c) => {
                    const active = form.shopCategories.includes(c.id);
                    return (
                      <button
                        type="button"
                        key={c.id}
                        className={`apply-chip${active ? " is-active" : ""}`}
                        onClick={() => toggleCategory(c.id)}
                      >
                        {active && <Check size={13} weight="bold" />}
                        {c.name}
                      </button>
                    );
                  })}
                </div>
                {errors.shopCategories
                  ? <span className="field-error">{errors.shopCategories}</span>
                  : <span className="field-hint">Pick up to {MAX_CATEGORIES} — this is where your products appear.</span>}
              </div>

              <div className="apply-field">
                <label>Shop Description</label>
                <textarea
                  value={form.shopDescription}
                  onChange={(e) => set("shopDescription", e.target.value)}
                  onBlur={() => touch("shopDescription")}
                  placeholder="Tell buyers about your products — freshness, farm source, certifications…"
                  rows={4}
                  maxLength={1000}
                />
                {errors.shopDescription && <span className="field-error">{errors.shopDescription}</span>}
              </div>

              <div className="apply-field">
                <label>Shop Logo</label>
                <div className="apply-logo-row">
                  <UploadBox
                    label="Upload shop logo"
                    hint="Square image works best"
                    endpoint="/upload/image"
                    fileId={form.shopLogoUrl}
                    // The logo is public, so it renders from the backend path
                    // rather than a local object URL that dies on refresh.
                    previewUrl={resolveImg(form.shopLogoUrl)}
                    onChange={(fileId) => set("shopLogoUrl", fileId)}
                  />
                  <span className="field-hint">
                    Optional, but your storefront won't look empty on day one.
                  </span>
                </div>
              </div>

              <div className="apply-field">
                <label>Shop Address / Location <span className="req">*</span></label>
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
                {(errors.shopAddress || errors.municipalityId)
                  ? <span className="field-error">{errors.shopAddress || errors.municipalityId}</span>
                  : (
                    <span className="field-hint">
                      The municipality you pick here decides which municipal admin reviews your shop.
                    </span>
                  )}
              </div>
            </div>
          </section>

          {/* ── Business details ── */}
          <section className="apply-card apply-section">
            <div className="apply-section-head">
              <Buildings size={22} />
              <div>
                <h2>Business Details</h2>
                <p>Individual sellers can skip the permit fields. Registered businesses should fill them in.</p>
              </div>
            </div>

            <div className="apply-form">
              <div className="apply-field">
                <label>How do you sell? <span className="req">*</span></label>
                <div className="apply-options">
                  {BUSINESS_TYPES.map((option) => (
                    <label
                      key={option.value}
                      className={`apply-option${form.sellerBusinessType === option.value ? " is-active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="sellerBusinessType"
                        value={option.value}
                        checked={form.sellerBusinessType === option.value}
                        onChange={(e) => set("sellerBusinessType", e.target.value)}
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.hint}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {isRegistered && (
                <>
                  <div className="apply-field">
                    <label>DTI / SEC Registration or Business Permit No. <span className="req">*</span></label>
                    <input
                      type="text"
                      value={form.sellerPermitNumber}
                      onChange={(e) => set("sellerPermitNumber", e.target.value)}
                      onBlur={() => touch("sellerPermitNumber")}
                      placeholder="e.g. 0123456"
                      className={errors.sellerPermitNumber ? "input-error" : ""}
                    />
                    {errors.sellerPermitNumber && <span className="field-error">{errors.sellerPermitNumber}</span>}
                  </div>

                  <div className="apply-field">
                    <label>BIR TIN</label>
                    <input
                      type="text"
                      value={form.sellerBirTin}
                      onChange={(e) => set("sellerBirTin", e.target.value)}
                      placeholder="000-000-000-000"
                    />
                  </div>

                  <div className="apply-field">
                    <label>Permit / Registration Photo</label>
                    <UploadBox
                      label="Upload permit"
                      hint="A clear photo or scan"
                      fileId={form.sellerPermitUrl}
                      previewUrl={previews.sellerPermitUrl}
                      onChange={(fileId, preview) => setUpload("sellerPermitUrl", fileId, preview)}
                    />
                  </div>
                </>
              )}
            </div>
          </section>

          {/* ── Payments & delivery ── */}
          <section className="apply-card apply-section">
            <div className="apply-section-head">
              <Wallet size={22} />
              <div>
                <h2>Payments &amp; Delivery</h2>
                <p>How you want to be paid and how orders reach buyers. You can change this later in Seller Center.</p>
              </div>
            </div>

            <div className="apply-form">
              <div className="apply-field">
                <label>Payout Method <span className="req">*</span></label>
                <select
                  value={form.payoutMethod}
                  onChange={(e) => set("payoutMethod", e.target.value)}
                >
                  {PAYOUT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>

              {needsPayoutAccount && (
                <div className="apply-pay-grid">
                  <div className="apply-field">
                    <label>Account Name <span className="req">*</span></label>
                    <input
                      type="text"
                      value={form.payoutAccountName}
                      onChange={(e) => set("payoutAccountName", e.target.value)}
                      onBlur={() => touch("payoutAccountName")}
                      placeholder="Name on the account"
                      className={errors.payoutAccountName ? "input-error" : ""}
                    />
                    {errors.payoutAccountName && <span className="field-error">{errors.payoutAccountName}</span>}
                  </div>
                  <div className="apply-field">
                    <label>Account Number <span className="req">*</span></label>
                    <input
                      type="text"
                      value={form.payoutAccountNumber}
                      onChange={(e) => set("payoutAccountNumber", e.target.value)}
                      onBlur={() => touch("payoutAccountNumber")}
                      placeholder="09171234567"
                      className={errors.payoutAccountNumber ? "input-error" : ""}
                    />
                    {errors.payoutAccountNumber && <span className="field-error">{errors.payoutAccountNumber}</span>}
                  </div>
                </div>
              )}

              <div className="apply-field">
                <label>How will buyers get their orders? <span className="req">*</span></label>
                <div className="apply-options apply-options--inline">
                  {FULFILLMENT_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`apply-option${form.fulfillmentPreference === option.value ? " is-active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="fulfillmentPreference"
                        value={option.value}
                        checked={form.fulfillmentPreference === option.value}
                        onChange={(e) => set("fulfillmentPreference", e.target.value)}
                      />
                      <span><strong>{option.label}</strong></span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── Identity verification (OCR, same check as Profile → Verification) ── */}
          <section className="apply-card apply-section" id="apply-identity">
            <div className="apply-section-head">
              <ShieldCheck size={22} />
              <div>
                <h2>Identity Verification</h2>
                <p>
                  {identityVerified
                    ? "Your identity is verified — there's nothing to upload."
                    : "Scan a valid government-issued ID. We read it automatically and match it to your account, so your application can be approved faster."}
                </p>
              </div>
            </div>

            {identityVerified ? (
              <div className="apply-verified">
                <CheckCircle size={20} weight="fill" />
                <div>
                  <strong>Identity verified</strong>
                  <span>
                    Your ID matched your account, and no copy of the photo was kept.{" "}
                    <Link to={IDENTITY_VERIFICATION_PATH}>View verification</Link>
                  </span>
                </div>
              </div>
            ) : (
              <IdentityVerifier
                as="div"
                verifiedText="Your identity is verified. You can submit your application."
                onVerified={() => setVerifiedHere(true)}
              />
            )}
          </section>
        </div>

        {/* ── Live preview, stays in view while scrolling ── */}
        <aside className="apply-aside">
          <div className="apply-preview">
            <div className="apply-preview-head">
              <h3>Application preview</h3>
              <span>{missing.length === 0 ? "Ready to submit" : `${missing.length} item${missing.length === 1 ? "" : "s"} left`}</span>
            </div>

            <div className="apply-preview-shop">
              {form.shopLogoUrl
                ? <img className="apply-preview-logo" src={resolveImg(form.shopLogoUrl)} alt="" />
                : (
                  <span className="apply-preview-avatar">
                    {(form.shopName.trim() || "S").charAt(0).toUpperCase()}
                  </span>
                )}
              <span className="apply-preview-shop-text">
                <strong>{form.shopName.trim() || "Your shop name"}</strong>
                <span>{form.shopTagline.trim() || form.shopAddress || "Shop address"}</span>
              </span>
            </div>

            {form.shopDescription && <p className="apply-preview-desc">{form.shopDescription}</p>}

            {form.shopCategories.length > 0 && (
              <div className="apply-preview-cats">
                {form.shopCategories.map((id) => {
                  const category = categories.find((c) => c.id === id);
                  return category ? <span key={id}>{category.name}</span> : null;
                })}
              </div>
            )}

            <dl className="apply-preview-list">
              <dt>Applicant</dt>
              <dd>{user?.fullName || "—"}</dd>
              <dt>Contact</dt>
              <dd>{contactNumber || "—"}</dd>
              <dt>Reviewed by</dt>
              <dd>{form.municipalityName ? `${form.municipalityName} admin` : "Select a municipality"}</dd>
              <dt>Identity</dt>
              <dd>{identityVerified ? "Verified" : form.idType || "Not selected"}</dd>
            </dl>

            {thumbs.length > 0 && (
              <div className="apply-preview-thumbs">
                {thumbs.map((url, i) => <img key={i} src={url} alt="" />)}
              </div>
            )}

            {missing.length > 0 && (
              <ul className="apply-preview-missing">
                {missing.map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}

            <label className="apply-terms-check">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
              />
              <span>
                I confirm the information above is accurate and I agree to Emoorm's{" "}
                <Link to="/terms" target="_blank" rel="noreferrer">Seller Terms of Service</Link>.
              </span>
            </label>

            <button
              className="apply-btn-submit"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting…" : "Submit Application"}
              {!isSubmitting && <ArrowRight size={16} />}
            </button>
            <p className="apply-draft-note">Your progress is saved automatically.</p>
          </div>
        </aside>
      </div>

      {confirming && (
        <div className="apply-confirm-backdrop" onClick={() => setConfirming(false)}>
          <div className="apply-confirm" onClick={(e) => e.stopPropagation()}>
            <h3>Submit this application?</h3>
            <p>
              The {form.municipalityName || "municipal"} admin will be notified and will review your
              shop. You can't edit it while it's under review.
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
