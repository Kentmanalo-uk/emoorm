import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShieldCheck, ShieldWarning, IdentificationCard, Camera, UploadSimple,
  CircleNotch, XCircle, ArrowClockwise, LockSimple, ChatsCircle,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../../lib/axios';
import { fetchIdentityStatus, submitIdentityVerification } from '../../lib/identity';
import { useSheetClose } from '../../hooks/useSheetMotion';
import Skeleton from '../ui/Skeleton';
import '../../pages/ProfileVerification.css';

const STATUS_META = {
  NOT_VERIFIED: {
    label: 'Not Verified',
    tone: 'neutral',
    Icon: ShieldWarning,
    text: 'Verify your identity with a valid Philippine government-issued ID.',
  },
  PENDING: {
    label: 'Verification in Progress',
    tone: 'pending',
    Icon: CircleNotch,
    text: 'We are reading your ID and checking it against your account. This can take up to a minute.',
  },
  VERIFIED: {
    label: 'Verified',
    tone: 'success',
    Icon: ShieldCheck,
    text: 'Your identity is verified.',
  },
  FAILED: {
    label: 'Verification Failed',
    tone: 'error',
    Icon: XCircle,
    text: 'We could not verify your identity.',
  },
};

// Webcam capture for desktops; phones use the native camera through the file input.
function CameraCapture({ onCapture, onClose: onCloseProp }) {
  const [sheetClosing, onClose] = useSheetClose(onCloseProp);
  const videoRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 } },
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        setError('Camera is unavailable. Allow camera access or upload a photo instead.');
      }
    })();
    return () => stream?.getTracks().forEach((track) => track.stop());
  }, []);

  const capture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) onCapture(new File([blob], 'id-capture.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  };

  return (
    <div className={`idv-camera ui-sheet-backdrop${sheetClosing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-label="Capture ID photo">
      <div className="idv-camera-panel ui-sheet-panel">
        {error ? (
          <p className="idv-camera-error">{error}</p>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="idv-camera-video" />
            <p className="idv-camera-hint">Fit the whole card inside the frame and avoid glare.</p>
          </>
        )}
        <div className="idv-camera-actions">
          <button type="button" className="idv-btn idv-btn-ghost" onClick={onClose}>Cancel</button>
          {!error && (
            <button type="button" className="idv-btn idv-btn-primary" onClick={capture}>
              <Camera size={18} /> Capture
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** One photo slot (front or back) with camera, upload and preview. */
function PhotoSlot({ side, label, hint, previewUrl, disabled, optional, onPick, onClear, onCamera }) {
  const inputRef = useRef(null);
  return (
    <div className="idv-field">
      <span className="idv-label">
        {label}
        {optional && <em className="idv-optional"> · optional</em>}
      </span>
      {previewUrl ? (
        <div className="idv-preview">
          <img src={previewUrl} alt={`${label} preview`} />
          <button type="button" className="idv-btn idv-btn-ghost" onClick={onClear} disabled={disabled}>
            <ArrowClockwise size={16} /> Replace photo
          </button>
        </div>
      ) : (
        <div className="idv-drop">
          <IdentificationCard size={40} />
          <p>{hint}</p>
          <div className="idv-drop-actions">
            <button
              type="button"
              className="idv-btn idv-btn-outline"
              onClick={() => (navigator.mediaDevices?.getUserMedia ? onCamera(side) : inputRef.current?.click())}
            >
              <Camera size={18} /> Scan with camera
            </button>
            <button type="button" className="idv-btn idv-btn-outline" onClick={() => inputRef.current?.click()}>
              <UploadSimple size={18} /> Upload photo
            </button>
          </div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          onPick(side, e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/**
 * The OCR identity check: pick the ID type, photograph the front (and back),
 * and the server reads the card and matches it to the account (name and
 * address at 50% or better). Used by Profile → Verification and by the
 * Seller Center's Verify identity page.
 *
 * verifiedText: what the verified state says in this context.
 * onStatus(status): every status the server returns.
 * onVerified(status): once, when the account becomes verified here.
 * as: 'form' (own <form>) or 'div' (when placed inside another form).
 * supportPath: the support inbox a stuck user is sent to.
 */
export default function IdentityVerifier({
  verifiedText, onStatus, onVerified, as = 'form', supportPath = '/profile/support',
}) {
  const [status, setStatusState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [idType, setIdType] = useState('');
  const [files, setFiles] = useState({ front: null, back: null });
  const [submitting, setSubmitting] = useState(false);
  const [cameraSide, setCameraSide] = useState(null);
  const [contacting, setContacting] = useState(false);
  const navigate = useNavigate();

  const setStatus = useCallback((next) => {
    setStatusState(next);
    onStatus?.(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    try {
      setStatus(await fetchIdentityStatus());
    } catch (error) {
      toast.error(error?.message || 'Failed to load verification status');
    } finally {
      setLoading(false);
    }
  }, [setStatus]);

  useEffect(() => { load(); }, [load]);

  // Keep the previews local to the browser and release them when replaced.
  const frontPreview = useMemo(() => (files.front ? URL.createObjectURL(files.front) : ''), [files.front]);
  const backPreview = useMemo(() => (files.back ? URL.createObjectURL(files.back) : ''), [files.back]);
  useEffect(() => () => {
    if (frontPreview) URL.revokeObjectURL(frontPreview);
  }, [frontPreview]);
  useEffect(() => () => {
    if (backPreview) URL.revokeObjectURL(backPreview);
  }, [backPreview]);

  const pickFile = (side, selected) => {
    if (!selected) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type)) {
      toast.error('Use a JPG, PNG, or WebP image.');
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      toast.error('Image must be 5 MB or smaller.');
      return;
    }
    setFiles((current) => ({ ...current, [side]: selected }));
  };

  const current = submitting ? 'PENDING' : (status?.status || 'NOT_VERIFIED');
  const selectedType = status?.supportedIdTypes?.find((option) => option.value === idType);
  // Cards that print an address carry it on the back, so both sides are needed.
  const backRequired = Boolean(idType) && selectedType?.hasAddress !== false;
  const outOfAttempts = status?.attemptsRemaining === 0;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!idType) {
      toast.error('Select your ID type');
      return;
    }
    if (!files.front) {
      toast.error('Capture or upload a photo of the front of your ID');
      return;
    }
    if (backRequired && !files.back) {
      toast.error('Capture or upload a photo of the back of your ID');
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitIdentityVerification(idType, files.front, files.back);
      setStatus(result);
      setFiles({ front: null, back: null });
      if (result.status === 'VERIFIED') {
        toast.success('Your identity has been verified');
        onVerified?.(result);
      } else {
        toast.error('Identity verification failed');
      }
    } catch (error) {
      toast.error(error?.message || 'Verification failed. Please try again.');
      load();
    } finally {
      setSubmitting(false);
    }
  };

  // Opens a support case with the municipal admin for the user's address.
  const contactSupport = async () => {
    setContacting(true);
    try {
      const reason = status?.failureReason ? ` Last result: "${status.failureReason}"` : '';
      const res = await axios.post('/support/cases', {
        category: 'IDENTITY_VERIFICATION',
        subject: 'Help verifying my identity',
        message: `Hi, I reached today's limit for identity verification and still can't verify my account.${reason} Could you help me verify my identity?`,
      });
      navigate(`${supportPath}?c=${res.data.id}`);
    } catch (error) {
      toast.error(error?.message || 'Could not reach municipal support');
    } finally {
      setContacting(false);
    }
  };

  if (loading) {
    return (
      <div className="idv-card" aria-busy="true">
        <Skeleton height={60} radius={12} />
        <Skeleton height={44} radius={10} />
        <Skeleton height={140} radius={12} />
      </div>
    );
  }

  const meta = STATUS_META[current] || STATUS_META.NOT_VERIFIED;
  const StatusIcon = meta.Icon;
  const canSubmit = current === 'NOT_VERIFIED' || current === 'FAILED';
  const FormTag = as === 'form' ? 'form' : 'div';

  return (
    <div className="idv-verifier">
      <section className={`idv-status idv-status--${meta.tone}`} aria-live="polite">
        <span className="idv-status-icon">
          <StatusIcon size={28} weight={current === 'PENDING' ? 'bold' : 'fill'} className={current === 'PENDING' ? 'idv-spin' : ''} />
        </span>
        <div className="idv-status-body">
          <strong>{meta.label}</strong>
          <p>
            {current === 'FAILED' && status?.failureReason
              ? status.failureReason
              : current === 'VERIFIED' && verifiedText ? verifiedText : meta.text}
          </p>
          {current === 'VERIFIED' && status?.idTypeLabel && (
            <span className="idv-status-meta">
              Verified with {status.idTypeLabel}
              {status.verifiedAt && ` on ${new Date(status.verifiedAt).toLocaleDateString()}`}
            </span>
          )}
          {outOfAttempts && current !== 'VERIFIED' && (
            <span className="idv-status-meta">
              You've used all verification attempts for today. Your municipal admin can help.
            </span>
          )}
        </div>
        {outOfAttempts && current !== 'VERIFIED' && (
          <button
            type="button"
            className="idv-btn idv-btn-primary idv-status-action"
            onClick={contactSupport}
            disabled={contacting}
          >
            <ChatsCircle size={18} weight="fill" />
            {contacting ? 'Opening…' : 'Contact support'}
          </button>
        )}
      </section>

      {!submitting && status?.debug && (
        <details className="idv-debug">
          <summary>OCR debug (development only)</summary>
          <pre>{`${JSON.stringify(status.debug.scores)}\n\n${status.debug.ocrText}`}</pre>
        </details>
      )}

      {canSubmit && (
        <FormTag className="idv-card" {...(as === 'form' ? { onSubmit: handleSubmit } : {})}>
          <div className="idv-card-head">
            <h2>{current === 'FAILED' ? 'Try again with a valid ID' : 'Verify with a government ID'}</h2>
            {status?.attemptsRemaining != null && (
              <span className="idv-attempts">
                {status.attemptsRemaining} attempt{status.attemptsRemaining === 1 ? '' : 's'} left today
              </span>
            )}
          </div>

          <label className="idv-field">
            <span className="idv-label">ID type</span>
            <select
              className="idv-input"
              value={idType}
              onChange={(e) => setIdType(e.target.value)}
              disabled={submitting}
            >
              <option value="">Select your ID</option>
              {(status?.supportedIdTypes || []).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <PhotoSlot
            side="front"
            label="Photo of the front of your ID"
            hint="Use a clear, well-lit photo showing the whole card. Your name must be readable."
            previewUrl={frontPreview}
            disabled={submitting}
            onPick={pickFile}
            onClear={() => setFiles((cur) => ({ ...cur, front: null }))}
            onCamera={setCameraSide}
          />

          <PhotoSlot
            side="back"
            label="Photo of the back of your ID"
            hint={backRequired
              ? 'Most IDs print the address on the back. Make sure the address is readable.'
              : 'Add the back of the card if it has printed details.'}
            optional={!backRequired}
            previewUrl={backPreview}
            disabled={submitting}
            onPick={pickFile}
            onClear={() => setFiles((cur) => ({ ...cur, back: null }))}
            onCamera={setCameraSide}
          />

          <ul className="idv-rules">
            <li>The name on your ID must closely match your account name. <Link to="/profile/settings">Edit profile</Link></li>
            {selectedType?.hasAddress === false ? (
              <li>This ID has no printed address, so only your name and ID number are checked. The back photo is optional.</li>
            ) : (
              <li>The address on your ID must closely match your registered address. It is usually printed on the back.</li>
            )}
            <li>Each ID can verify only one account.</li>
          </ul>

          <p className="idv-privacy">
            <LockSimple size={16} />
            Your ID photos are processed once and discarded. We only keep encrypted verification details.
          </p>

          <div className="idv-actions">
            <button
              type={as === 'form' ? 'submit' : 'button'}
              onClick={as === 'form' ? undefined : handleSubmit}
              className="idv-btn idv-btn-primary"
              disabled={submitting || !files.front || (backRequired && !files.back) || !idType || outOfAttempts}
            >
              {submitting ? <><CircleNotch size={18} className="idv-spin" /> Verifying...</> : 'Verify identity'}
            </button>
            {outOfAttempts && <span className="idv-attempts">Daily attempt limit reached. Try again tomorrow.</span>}
          </div>
        </FormTag>
      )}

      {cameraSide && (
        <CameraCapture
          onClose={() => setCameraSide(null)}
          onCapture={(captured) => {
            pickFile(cameraSide, captured);
            setCameraSide(null);
          }}
        />
      )}
    </div>
  );
}
