import React, { useState, useRef } from "react";
import { useNavigate, Navigate, Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle, UploadSimple as Upload, X, User, Storefront as Store, ShieldCheck, Eye } from "@phosphor-icons/react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import useAuthStore from "../store/authStore";
import "./SellerApply.css";

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

const STEPS = [
  { n: 1, label: "Personal Info", icon: <User size={16} /> },
  { n: 2, label: "Shop Details", icon: <Store size={16} /> },
  { n: 3, label: "Verification", icon: <ShieldCheck size={16} /> },
  { n: 4, label: "Review", icon: <Eye size={16} /> },
];

function UploadBox({ label, hint, fileId, previewUrl, onChange, required }) {
  const ref = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Preview locally from the selected file — never round-trips a fetchable
    // URL to this sensitive document, unlike the old public /uploads path.
    const localPreview = URL.createObjectURL(file);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await axios.post("/upload/kyc", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onChange(res.data.fileId, localPreview);
      toast.success("Photo uploaded");
    } catch (err) {
      URL.revokeObjectURL(localPreview);
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = "";
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

export default function SellerApply() {
  const navigate = useNavigate();
  const { isAuthenticated, user, updateUser } = useAuthStore();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    // Step 2
    shopName: "",
    shopDescription: "",
    shopAddress: user?.address || "",
    // Step 3
    idType: "",
    idFrontUrl: "",
    idBackUrl: "",
    selfieUrl: "",
  });

  // Local-only object URLs for the ID photo previews (never sent to the server).
  const [previews, setPreviews] = useState({ idFrontUrl: null, idBackUrl: null, selfieUrl: null });

  const [errors, setErrors] = useState({});

  if (!isAuthenticated) return <Navigate to="/login?redirect=/seller/apply" replace />;
  if (user?.role === "SELLER") return <Navigate to="/seller" replace />;

  if (user?.sellerApplicationStatus === "PENDING") {
    return (
      <div className="apply-page">
        <div className="apply-card apply-card-status">
          <CheckCircle size={56} className="apply-status-icon apply-status-icon--pending" />
          <h2>Application Under Review</h2>
          <p>Your seller application has been submitted and is currently being reviewed by our team. We'll notify you once it's approved (usually 1–2 business days).</p>
          <Link to="/" className="apply-back-btn">Back to shop</Link>
        </div>
      </div>
    );
  }

  const set = (key, val) => {
    setForm((p) => ({ ...p, [key]: val }));
    if (errors[key]) setErrors((p) => ({ ...p, [key]: "" }));
  };

  const setUpload = (key, fileId, previewUrl) => {
    set(key, fileId);
    setPreviews((p) => ({ ...p, [key]: previewUrl }));
  };

  const validateStep = () => {
    const errs = {};
    if (step === 2) {
      if (!form.shopName.trim()) errs.shopName = "Shop name is required";
      if (!form.shopAddress.trim()) errs.shopAddress = "Shop address is required";
    }
    if (step === 3) {
      if (!form.idType) errs.idType = "Please select an ID type";
      if (!form.idFrontUrl) errs.idFrontUrl = "Front photo of ID is required";
      if (!form.idBackUrl) errs.idBackUrl = "Back photo of ID is required";
      if (!form.selfieUrl) errs.selfieUrl = "Selfie with ID is required";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => {
    if (!validateStep()) return;
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const back = () => {
    setStep((s) => s - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const res = await axios.post("/auth/apply-seller", form);
      const updated = res?.data ?? res;
      updateUser({
        ...user,
        ...(updated || {}),
        role: updated?.role || 'SELLER',
        sellerApplicationStatus: updated?.sellerApplicationStatus || 'PENDING',
      });
      toast.success("Application submitted! Redirecting to your dashboard…");
      setTimeout(() => navigate("/seller"), 1200);
    } catch (err) {
      toast.error(err.message || "Submission failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="apply-page">
      <div className="apply-card apply-card-wide">
        {/* Back */}
        <Link to="/sell" className="apply-back-link">
          <ArrowLeft size={16} /> Back to seller info
        </Link>

        {/* Progress */}
        <div className="apply-progress">
          {STEPS.map((s) => (
            <div key={s.n} className={`apply-step ${step === s.n ? "apply-step--active" : ""} ${step > s.n ? "apply-step--done" : ""}`}>
              <div className="apply-step-circle">
                {step > s.n ? <CheckCircle size={16} /> : s.icon}
              </div>
              <span className="apply-step-label">{s.label}</span>
              {s.n < STEPS.length && <div className="apply-step-line" />}
            </div>
          ))}
        </div>

        {/* ── Step 1: Personal Info ── */}
        {step === 1 && (
          <div className="apply-section">
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
              <div className="apply-info-row"><span>Contact Number</span>
                <strong className={!user?.contactNumber ? "apply-missing" : ""}>
                  {user?.contactNumber || "Not set — update in profile first"}
                </strong>
              </div>
              <div className="apply-info-row"><span>Address</span>
                <strong className={!user?.address ? "apply-missing" : ""}>
                  {[user?.address, user?.barangay, user?.municipality?.name].filter(Boolean).join(", ") || "Not set"}
                </strong>
              </div>
            </div>
            {!user?.contactNumber && (
              <div className="apply-warn">
                <strong>Contact number is missing.</strong> Please{" "}
                <Link to="/profile">update your profile</Link> before applying.
              </div>
            )}
            <div className="apply-nav">
              <span />
              <button className="apply-btn-primary" onClick={next} disabled={!user?.contactNumber}>
                Next: Shop Details <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Shop Details ── */}
        {step === 2 && (
          <div className="apply-section">
            <div className="apply-section-head">
              <Store size={22} />
              <div>
                <h2>Shop Details</h2>
                <p>Tell buyers about your store. This will be reviewed by our team before going live.</p>
              </div>
            </div>

            <div className="apply-form">
              <div className="apply-field">
                <label>Shop / Store Name <span className="req">*</span></label>
                <input
                  type="text"
                  value={form.shopName}
                  onChange={(e) => set("shopName", e.target.value)}
                  placeholder="e.g. Maria's Fresh Farm"
                  className={errors.shopName ? "input-error" : ""}
                />
                {errors.shopName && <span className="field-error">{errors.shopName}</span>}
              </div>

              <div className="apply-field">
                <label>What do you sell? <span className="req">*</span></label>
                <textarea
                  value={form.shopDescription}
                  onChange={(e) => set("shopDescription", e.target.value)}
                  placeholder="Describe your products — type, freshness, farm source, certifications…"
                  rows={4}
                />
              </div>

              <div className="apply-field">
                <label>Shop Address / Location <span className="req">*</span></label>
                <input
                  type="text"
                  value={form.shopAddress}
                  onChange={(e) => set("shopAddress", e.target.value)}
                  placeholder="Barangay, Municipality, Oriental Mindoro"
                  className={errors.shopAddress ? "input-error" : ""}
                />
                {errors.shopAddress && <span className="field-error">{errors.shopAddress}</span>}
              </div>
            </div>

            <div className="apply-nav">
              <button className="apply-btn-ghost" onClick={back}><ArrowLeft size={16} /> Back</button>
              <button className="apply-btn-primary" onClick={next}>Next: Verification <ArrowRight size={16} /></button>
            </div>
          </div>
        )}

        {/* ── Step 3: ID Verification ── */}
        {step === 3 && (
          <div className="apply-section">
            <div className="apply-section-head">
              <ShieldCheck size={22} />
              <div>
                <h2>Identity Verification</h2>
                <p>Upload a valid government-issued ID. This is required to build trust with buyers and comply with local regulations.</p>
              </div>
            </div>

            <div className="apply-form">
              <div className="apply-field">
                <label>Type of Valid ID <span className="req">*</span></label>
                <select
                  value={form.idType}
                  onChange={(e) => set("idType", e.target.value)}
                  className={errors.idType ? "input-error" : ""}
                >
                  <option value="">Select ID type…</option>
                  {ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                {errors.idType && <span className="field-error">{errors.idType}</span>}
              </div>

              <div className="upload-grid">
                <div className="apply-field">
                  <label>Front of ID <span className="req">*</span></label>
                  <UploadBox
                    label="Upload front of ID"
                    hint="Clear photo, all corners visible"
                    fileId={form.idFrontUrl}
                    previewUrl={previews.idFrontUrl}
                    onChange={(fileId, preview) => setUpload("idFrontUrl", fileId, preview)}
                    required
                  />
                  {errors.idFrontUrl && <span className="field-error">{errors.idFrontUrl}</span>}
                </div>

                <div className="apply-field">
                  <label>Back of ID <span className="req">*</span></label>
                  <UploadBox
                    label="Upload back of ID"
                    hint="Include signature if present"
                    fileId={form.idBackUrl}
                    previewUrl={previews.idBackUrl}
                    onChange={(fileId, preview) => setUpload("idBackUrl", fileId, preview)}
                    required
                  />
                  {errors.idBackUrl && <span className="field-error">{errors.idBackUrl}</span>}
                </div>

                <div className="apply-field upload-full">
                  <label>Selfie holding your ID <span className="req">*</span></label>
                  <UploadBox
                    label="Upload selfie with ID"
                    hint="Hold ID beside your face — text must be readable"
                    fileId={form.selfieUrl}
                    previewUrl={previews.selfieUrl}
                    onChange={(fileId, preview) => setUpload("selfieUrl", fileId, preview)}
                    required
                  />
                  {errors.selfieUrl && <span className="field-error">{errors.selfieUrl}</span>}
                </div>
              </div>

              <div className="apply-id-note">
                <ShieldCheck size={15} />
                Your ID photos are stored privately and only visible to our admin team for verification purposes.
              </div>
            </div>

            <div className="apply-nav">
              <button className="apply-btn-ghost" onClick={back}><ArrowLeft size={16} /> Back</button>
              <button className="apply-btn-primary" onClick={next}>Review & Submit <ArrowRight size={16} /></button>
            </div>
          </div>
        )}

        {/* ── Step 4: Review & Submit ── */}
        {step === 4 && (
          <div className="apply-section">
            <div className="apply-section-head">
              <Eye size={22} />
              <div>
                <h2>Review Your Application</h2>
                <p>Confirm everything looks correct before submitting. You can go back to make changes.</p>
              </div>
            </div>

            <div className="review-blocks">
              <div className="review-block">
                <div className="review-block-head">
                  <User size={15} /> Personal Info
                  <button onClick={() => setStep(1)}>Edit</button>
                </div>
                <div className="apply-info-grid">
                  <div className="apply-info-row"><span>Name</span><strong>{user?.fullName}</strong></div>
                  <div className="apply-info-row"><span>Contact</span><strong>{user?.contactNumber}</strong></div>
                </div>
              </div>

              <div className="review-block">
                <div className="review-block-head">
                  <Store size={15} /> Shop Details
                  <button onClick={() => setStep(2)}>Edit</button>
                </div>
                <div className="apply-info-grid">
                  <div className="apply-info-row"><span>Shop Name</span><strong>{form.shopName}</strong></div>
                  <div className="apply-info-row"><span>Address</span><strong>{form.shopAddress}</strong></div>
                  {form.shopDescription && (
                    <div className="apply-info-row apply-info-row--col">
                      <span>Description</span>
                      <p className="review-desc">{form.shopDescription}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="review-block">
                <div className="review-block-head">
                  <ShieldCheck size={15} /> Verification
                  <button onClick={() => setStep(3)}>Edit</button>
                </div>
                <div className="apply-info-grid">
                  <div className="apply-info-row"><span>ID Type</span><strong>{form.idType}</strong></div>
                  <div className="apply-info-row"><span>Documents</span>
                    <div className="review-thumbs">
                      {[previews.idFrontUrl, previews.idBackUrl, previews.selfieUrl].filter(Boolean).map((url, i) => (
                        <img key={i} src={url} alt="" />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="apply-terms">
              By submitting, I confirm that all information provided is accurate and I agree to Emoorm's{" "}
              <a href="#" target="_blank" rel="noreferrer">Seller Terms of Service</a>.
            </div>

            <div className="apply-nav">
              <button className="apply-btn-ghost" onClick={back}><ArrowLeft size={16} /> Back</button>
              <button className="apply-btn-submit" onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? "Submitting…" : "Submit Application"}
                {!isSubmitting && <ArrowRight size={16} />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
