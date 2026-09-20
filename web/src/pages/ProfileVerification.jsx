import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShieldCheck, ShieldWarning, IdentificationCard, Camera, UploadSimple,
  CircleNotch, XCircle, ArrowClockwise, LockSimple, ChatsCircle,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import { fetchIdentityStatus, submitIdentityVerification } from '../lib/identity';
import './ProfileVerification.css';

const STATUS_META = {
  NOT_VERIFIED: {
    label: 'Not Verified',
    tone: 'neutral',
    Icon: ShieldWarning,
    text: 'Verify your identity with a valid Philippine government-issued ID to start checking out.',
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
    text: 'Your identity is verified. You can check out and place orders.',
  },
  FAILED: {
    label: 'Verification Failed',
    tone: 'error',
    Icon: XCircle,
    text: 'We could not verify your identity.',
  },
};

// Webcam capture for desktops; phones use the native camera through the file input.
function CameraCapture({ onCapture, onClose }) {
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
    <div className="idv-camera" role="dialog" aria-modal="true" aria-label="Capture ID photo">
      <div className="idv-camera-panel">
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

export default function ProfileVerification() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [idType, setIdType] = useState('');
  const [files, setFiles] = useState({ front: null, back: null });
  const [submitting, setSubmitting] = useState(false);
  const [cameraSide, setCameraSide] = useState(null);
  const [contacting, setContacting] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      setStatus(await fetchIdentityStatus());
    } catch (error) {
      toast.error(error?.message || 'Failed to load verification status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIdentityStatus()
      .then(setStatus)
      .catch((error) => toast.error(error?.message || 'Failed to load verification status'))
      .finally(() => setLoading(false));
  }, []);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
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
      if (result.status === 'VERIFIED') toast.success('Your identity has been verified');
      else toast.error('Identity verification failed');
    } catch (error) {
      toast.error(error?.message || 'Verification failed. Please try again.');
      load();
    } finally {
      setSubmitting(false);
    }
  };

  // Opens the help chat with the municipal admin for the user's address.
  const contactSupport = async () => {
    setContacting(true);
    try {
      const res = await axios.post('/support/chat/municipal', { topic: 'IDENTITY_VERIFICATION' });
      const reason = status?.failureReason ? ` Last result: "${status.failureReason}"` : '';
      navigate(`/profile/support?c=${res.data.id}`, {
        state: {
          draft: `Hi, I reached today's limit for identity verification and still can't verify my account.${reason} Could you help me verify my identity?`,
        },
      });
    } catch (error) {
      toast.error(error?.message || 'Could not reach municipal support');
    } finally {
      setContacting(false);
    }
  };

  if (loading) {
    return (
      <div className="profile-loading">
        <div className="profile-loading-spinner"></div>
        <p>Loading verification status...</p>
      </div>
    );
  }

  const current = submitting ? 'PENDING' : (status?.status || 'NOT_VERIFIED');
  const meta = STATUS_META[current] || STATUS_META.NOT_VERIFIED;
  const StatusIcon = meta.Icon;
  const canSubmit = current === 'NOT_VERIFIED' || current === 'FAILED';
  const outOfAttempts = status?.attemptsRemaining === 0;
  const selectedType = status?.supportedIdTypes?.find((option) => option.value === idType);
  // Cards that print an address carry it on the back, so both sides are needed.
  const backRequired = Boolean(idType) && selectedType?.hasAddress !== false;

  return (
    <div className="profile-page-wrap idv-wrap">
      <header className="profile-page-header">
        <h1 className="profile-page-title">Identity Verification</h1>
        <p className="idv-subtitle">Verified identity is required before checking out.</p>
      </header>

      <section className={`idv-status idv-status--${meta.tone}`} aria-live="polite">
        <span className="idv-status-icon">
          <StatusIcon size={28} weight={current === 'PENDING' ? 'bold' : 'fill'} className={current === 'PENDING' ? 'idv-spin' : ''} />
        </span>
        <div className="idv-status-body">
          <strong>{meta.label}</strong>
          <p>{current === 'FAILED' && status?.failureReason ? status.failureReason : meta.text}</p>
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
        <form className="idv-card" onSubmit={handleSubmit}>
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
            onClear={() => setFiles((current) => ({ ...current, front: null }))}
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
            onClear={() => setFiles((current) => ({ ...current, back: null }))}
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
              type="submit"
              className="idv-btn idv-btn-primary"
              disabled={submitting || !files.front || (backRequired && !files.back) || !idType || outOfAttempts}
            >
              {submitting ? <><CircleNotch size={18} className="idv-spin" /> Verifying...</> : 'Verify identity'}
            </button>
            {outOfAttempts && <span className="idv-attempts">Daily attempt limit reached. Try again tomorrow.</span>}
          </div>
        </form>
      )}

      {current === 'VERIFIED' && (
        <p className="idv-note">
          Changing your name or barangay in <Link to="/profile/settings">Settings</Link> will require you to verify again.
        </p>
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
