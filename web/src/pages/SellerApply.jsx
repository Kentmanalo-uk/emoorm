import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Navigate, Link } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, CheckCircle, User,
  Storefront as Store, Warning, Check, MapPin, Sparkle,
} from "@phosphor-icons/react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import useAuthStore from "../store/authStore";
import PhAddressPicker from "../components/common/PhAddressPicker";
import AppLogo from "../components/AppLogo";
import resolveImg from "../lib/media";
import "./SellerApply.css";
import { useMunicipalities, useCategories } from '../hooks/useReferenceData';

const MAX_CATEGORIES = 5;

// What applying sends: the shop and where it is.
const APPLY_FIELDS = [
  "shopName", "shopCategories", "shopAddress", "municipalityId", "province",
  "shopTagline", "shopDescription", "shopLogoUrl",
];

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
  sellerBusinessType: "",
  sellerPermitNumber: "",
  sellerPermitUrl: "",
  sellerBirTin: "",
  payoutMethod: "",
  payoutAccountName: "",
  payoutAccountNumber: "",
  fulfillmentPreference: "",
  idType: "",
  idFrontUrl: "",
  idBackUrl: "",
};

export default function SellerApply() {
  const { isAuthenticated, user, updateUser } = useAuthStore();
  // Set when the ID passes the OCR check on this page.
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Set once this page's application goes through: the account is a seller
  // from then on, and goes to the guided setup rather than the Seller Center.
  const [applied, setApplied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // The municipality is deliberately NOT pre-filled from the profile: the
  // picker would show nothing while the form quietly carried the account's own
  // municipality, and that is the one field that decides who reviews the shop.
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    province: user?.province || "Oriental Mindoro",
    barangay: user?.barangay || "",
    street: user?.address || "",
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
    const keys = ["shopName", "shopAddress", "municipalityId", "shopCategories"];
    const errs = {};
    for (const key of keys) {
      const message = fieldError(key, form[key], form);
      if (message) errs[key] = message;
    }
    setErrors(errs);
    return errs;
  };

  const missing = useMemo(() => [
    !contactNumber && "Contact number",
    !form.shopName.trim() && "Shop name",
    !form.shopCategories.length && "Shop categories",
    !form.shopAddress.trim() && "Shop address",
    !acceptedTerms && "Accept the seller terms",
  ].filter(Boolean), [form, contactNumber, acceptedTerms]);

  const submit = async () => {
    setConfirming(false);
    setIsSubmitting(true);
    try {
      // Only what this form asks for (and shop details an older draft may
      // hold). Business and payout details come in the guided setup: an old
      // draft's half-filled payout must not block applying.
      const extras = Object.fromEntries(APPLY_FIELDS
        .map((key) => [key, form[key]])
        .filter(([, v]) => (Array.isArray(v) ? v.length : v)));
      const res = await axios.post("/auth/apply-seller", {
        ...extras,
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
          <div className="apply-intro">
            <h1>Open your shop</h1>
            <p>Just the basics for now: about two minutes. Logo, delivery, payments and your first product come next, one easy step at a time.</p>
          </div>

          {/* ── 1 · You ── */}
          <section className="apply-card apply-section">
            <div className="apply-section-head">
              <span className="apply-step-num" aria-hidden="true">1</span>
              <div>
                <h2>About you</h2>
                <p>How the admin and your buyers can reach you.</p>
              </div>
              <User size={22} className="apply-section-icon" />
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
            </div>
          </section>

          {/* ── 2 · The shop ── */}
          <section className="apply-card apply-section">
            <div className="apply-section-head">
              <span className="apply-step-num" aria-hidden="true">2</span>
              <div>
                <h2>Your shop</h2>
                <p>Its name and what it sells. You can change both later.</p>
              </div>
              <Store size={22} className="apply-section-icon" />
            </div>

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
                  ? <span className="field-error">{errors.shopName}</span>
                  : <span className="field-hint">{form.shopName.length}/60 · must be unique on Emoorm</span>}
              </div>

              <div className="apply-field">
                <label>What do you sell? <span className="req">*</span></label>
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
                  ? <span className="field-error">{errors.shopCategories}</span>
                  : <span className="field-hint">Pick up to {MAX_CATEGORIES}. This is where your products appear.</span>}
              </div>
            </div>
          </section>

          {/* ── 3 · Where ── */}
          <section className="apply-card apply-section">
            <div className="apply-section-head">
              <span className="apply-step-num" aria-hidden="true">3</span>
              <div>
                <h2>Where your shop is</h2>
                <p>The town you pick decides which municipal admin reviews your shop.</p>
              </div>
              <MapPin size={22} className="apply-section-icon" />
            </div>
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
                  <span className="field-error">{errors.shopAddress || errors.municipalityId}</span>
                )}
              </div>
            </div>
          </section>

          {/* What comes after: the guided setup. */}
          <section className="apply-next" aria-label="After you apply">
            <Sparkle size={20} weight="fill" />
            <div>
              <strong>After you apply</strong>
              <p>A short guided setup: verify your ID, how you get paid, your logo, delivery and your first product. Skip any step and finish it later.</p>
            </div>
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
            </dl>

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
              {isSubmitting ? "Submitting…" : "Open my shop"}
              {!isSubmitting && <ArrowRight size={16} />}
            </button>
            <p className="apply-draft-note">Your progress is saved automatically.</p>
          </div>
        </aside>
      </div>

      {confirming && (
        <div className="apply-confirm-backdrop" onClick={() => setConfirming(false)}>
          <div className="apply-confirm" onClick={(e) => e.stopPropagation()}>
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
