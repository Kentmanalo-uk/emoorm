import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShieldCheck, ShieldWarning, IdentificationCard, Camera, UploadSimple,
  CircleNotch, XCircle, ArrowClockwise, LockSimple, ChatsCircle, X, WarningCircle,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../../lib/axios';
import { fetchIdentityStatus, submitIdentityVerification } from '../../lib/identity';
import { checkIdFrame, ID_RATIO } from '../../lib/idCardCheck';
import Skeleton from '../ui/Skeleton';
import '../../pages/ProfileVerification.css';
import Select from '../ui/Select';

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

/** Checks a few times a second: quick enough to feel live, light on phones. */
const CHECK_EVERY_MS = 180;
/** Good this long (in a row) and the photo is taken by itself. */
const AUTO_AFTER_MS = 900;

/** What a photo that did not look right is told on the review screen. */
const REVIEW_WARNINGS = {
  blurry: 'It looks blurry. Retake it for a better chance of passing.',
  dark: 'It looks dark. Retake it in better light.',
  bright: 'It looks washed out. Retake it away from direct light.',
  glare: 'There is glare on your ID. Retake it without direct light on it.',
  place: 'Your ID may not be fully in the photo. Retake it inside the frame.',
  fit: 'Your ID may not be fully in the photo. Retake it inside the frame.',
  closer: 'Your ID looks small. Retake it closer, filling the frame.',
  back: 'Part of your ID may be cut off. Retake it a little farther away.',
  center: 'Your ID may not be fully in the photo. Retake it inside the frame.',
};

/** Where the on-screen guide falls in the camera image (the video fills the screen: object-fit cover). */
const guideInVideo = (video, guide) => {
  const vr = video.getBoundingClientRect();
  const gr = guide.getBoundingClientRect();
  const scale = Math.max(vr.width / video.videoWidth, vr.height / video.videoHeight);
  const offX = (vr.width - video.videoWidth * scale) / 2;
  const offY = (vr.height - video.videoHeight * scale) / 2;
  return {
    x: (gr.left - vr.left - offX) / scale,
    y: (gr.top - vr.top - offY) / scale,
    w: gr.width / scale,
    h: gr.height / scale,
  };
};

/** The guide and a margin around it, clamped to the camera image. */
const around = (frame, share, video) => {
  const x0 = Math.max(0, Math.floor(frame.x - frame.w * share));
  const y0 = Math.max(0, Math.floor(frame.y - frame.h * share));
  const x1 = Math.min(video.videoWidth, Math.ceil(frame.x + frame.w * (1 + share)));
  const y1 = Math.min(video.videoHeight, Math.ceil(frame.y + frame.h * (1 + share)));
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
};

/**
 * The ID camera, full screen: the camera behind an ID-shaped guide (the rest
 * dimmed), a live tip under it (move closer, hold steady, too dark, glare…)
 * from checks run on this phone, and the guide turning green when the photo
 * will read well. It takes the photo by itself once it has looked good for
 * a moment (the shutter works any time), then shows it to keep or retake.
 * Only the guide's area (plus a margin) is kept.
 */
function CameraCapture({ side, onCapture, onClose }) {
  const videoRef = useRef(null);
  const guideRef = useRef(null);
  const uploadRef = useRef(null);
  const canvasRef = useRef(null);
  const recentRef = useRef([]);
  const goodSinceRef = useRef(null);
  const [phase, setPhase] = useState('starting'); // starting | live | review | error
  const [result, setResult] = useState(null);
  const [placeHelp, setPlaceHelp] = useState(false);
  const [review, setReview] = useState(null); // { file, url, check }
  const title = side === 'back' ? 'Back of your ID' : 'Front of your ID';

  // The back camera, as sharp as the phone gives.
  useEffect(() => {
    let stream;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (videoRef.current) videoRef.current.srcObject = stream;
        setPhase('live');
      } catch {
        if (!stopped) setPhase('error');
      }
    })();
    return () => {
      stopped = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // Full screen: nothing behind it scrolls, and Escape closes it.
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const takePhoto = useCallback((check) => {
    const video = videoRef.current;
    const guide = guideRef.current;
    if (!video?.videoWidth || !guide) return;
    // The guide's area and a little around it, at the camera's full size.
    const crop = around(guideInVideo(video, guide), 0.07, video);
    const scale = Math.min(1, 2000 / crop.w);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(crop.w * scale);
    canvas.height = Math.round(crop.h * scale);
    canvas.getContext('2d').drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `id-${side || 'front'}.jpg`, { type: 'image/jpeg' });
      setReview({ file, url: URL.createObjectURL(file), check });
      setPhase('review');
    }, 'image/jpeg', 0.92);
  }, [side]);

  // The live checks, on a small copy of the guide's area.
  useEffect(() => {
    if (phase !== 'live') return undefined;
    recentRef.current = [];
    goodSinceRef.current = null;
    let placeSince = null;
    const timer = setInterval(() => {
      const video = videoRef.current;
      const guide = guideRef.current;
      if (!video?.videoWidth || !guide) return;
      const frame = guideInVideo(video, guide);
      const region = around(frame, 0.22, video);
      const scale = Math.min(1, 400 / region.w);
      const canvas = canvasRef.current || (canvasRef.current = document.createElement('canvas'));
      canvas.width = Math.max(1, Math.round(region.w * scale));
      canvas.height = Math.max(1, Math.round(region.h * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, region.x, region.y, region.w, region.h, 0, 0, canvas.width, canvas.height);
      const check = checkIdFrame(ctx.getImageData(0, 0, canvas.width, canvas.height), {
        x: (frame.x - region.x) * scale,
        y: (frame.y - region.y) * scale,
        w: frame.w * scale,
        h: frame.h * scale,
      });
      // The tip changes only when the last three checks agree: no flicker.
      const recent = [...recentRef.current, check].slice(-3);
      recentRef.current = recent;
      const steady = recent.length === 3 && recent.every((r) => r.check === check.check);
      if (steady) setResult(check);
      const now = Date.now();
      placeSince = check.check === 'place' ? (placeSince ?? now) : null;
      setPlaceHelp(Boolean(placeSince) && now - placeSince > 3000);
      if (steady && check.ok) {
        goodSinceRef.current = goodSinceRef.current ?? now;
        if (now - goodSinceRef.current >= AUTO_AFTER_MS) {
          clearInterval(timer);
          takePhoto('good');
        }
      } else {
        goodSinceRef.current = null;
      }
    }, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [phase, takePhoto]);

  useEffect(() => () => {
    if (review?.url) URL.revokeObjectURL(review.url);
  }, [review]);

  const retake = () => {
    setReview(null);
    setResult(null);
    setPhase('live');
  };

  // The guide: white while looking for the card, amber while it needs a
  // change, green when the photo will read well.
  const state = !result || result.check === 'place' ? 'search' : result.ok ? 'good' : 'adjust';
  const tip = phase === 'starting' ? 'Starting camera…' : result ? result.tip : 'Place your ID inside the frame';
  const warning = review && review.check !== 'good' ? REVIEW_WARNINGS[review.check] : null;

  return (
    <div className="idv-cam" role="dialog" aria-modal="true" aria-label={`Take a photo: ${title}`}>
      <video ref={videoRef} autoPlay playsInline muted className="idv-cam-video" hidden={phase === 'review'} />

      <div className="idv-cam-top">
        <button type="button" className="idv-cam-close" onClick={onClose} aria-label="Close camera">
          <X size={22} weight="bold" />
        </button>
        <strong>{phase === 'review' ? 'Check your photo' : title}</strong>
        <span aria-hidden="true" />
      </div>

      {phase === 'error' && (
        <div className="idv-cam-center">
          <div className="idv-cam-error">
            <Camera size={36} />
            <p>The camera is not available. Allow camera access in your browser, or upload a photo of your ID instead.</p>
            <button type="button" className="idv-cam-btn is-primary" onClick={() => uploadRef.current?.click()}>
              <UploadSimple size={18} /> Upload a photo
            </button>
          </div>
        </div>
      )}

      {(phase === 'starting' || phase === 'live') && (
        <>
          <div className="idv-cam-center">
            <div
              ref={guideRef}
              className={`idv-cam-guide is-${state}`}
              style={{ aspectRatio: String(ID_RATIO) }}
              aria-hidden="true"
            >
              <span className="idv-cam-corner is-tl" />
              <span className="idv-cam-corner is-tr" />
              <span className="idv-cam-corner is-bl" />
              <span className="idv-cam-corner is-br" />
            </div>
            <p className={`idv-cam-tip is-${state}`} role="status" aria-live="polite">{tip}</p>
            {placeHelp && <p className="idv-cam-help">Tip: lay your ID on a plain, darker surface.</p>}
          </div>
          <div className="idv-cam-bottom">
            <button type="button" className="idv-cam-upload" onClick={() => uploadRef.current?.click()}>
              <UploadSimple size={18} /> Upload
            </button>
            <button
              type="button"
              className={`idv-cam-shutter is-${state}`}
              onClick={() => takePhoto(result?.check || 'place')}
              disabled={phase !== 'live'}
              aria-label="Take photo"
            >
              <span />
            </button>
            <span className="idv-cam-spacer" aria-hidden="true" />
          </div>
        </>
      )}

      {phase === 'review' && review && (
        <>
          <div className="idv-cam-center">
            <img src={review.url} alt={`${title}, as taken`} className="idv-cam-photo" />
            {warning ? (
              <p className="idv-cam-warning"><WarningCircle size={18} weight="fill" /> {warning}</p>
            ) : (
              <p className="idv-cam-note">Is your whole ID in the photo, sharp and easy to read?</p>
            )}
          </div>
          {/* A photo that did not look right: Retake is the main button. */}
          <div className="idv-cam-bottom is-review">
            <button type="button" className={`idv-cam-btn${warning ? ' is-primary' : ''}`} onClick={retake}>
              <ArrowClockwise size={18} /> Retake
            </button>
            <button type="button" className={`idv-cam-btn${warning ? '' : ' is-primary'}`} onClick={() => onCapture(review.file)}>
              Use photo
            </button>
          </div>
        </>
      )}

      <input
        ref={uploadRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = '';
          if (picked) onCapture(picked);
        }}
      />
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
 * The OCR identity check: pick the ID type, photograph the front (the back
 * is optional), and the server reads the card and matches the name on it to
 * the account's name (50% or better; the address is not compared). Used by
 * Profile → Verification and by the Seller Center's Verify identity page.
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
  const closeCamera = useCallback(() => setCameraSide(null), []);

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
            <Select
              className="idv-input"
              value={idType}
              onChange={(e) => setIdType(e.target.value)}
              disabled={submitting}
            >
              <option value="">Select your ID</option>
              {(status?.supportedIdTypes || []).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
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
            hint="Add the back of the card if your name or ID number is printed there."
            optional
            previewUrl={backPreview}
            disabled={submitting}
            onPick={pickFile}
            onClear={() => setFiles((cur) => ({ ...cur, back: null }))}
            onCamera={setCameraSide}
          />

          <ul className="idv-rules">
            <li>The name on your ID must closely match your account name. <Link to="/profile/settings/profile">Edit your name</Link></li>
            <li>Only your name is checked, not your address.</li>
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
              disabled={submitting || !files.front || !idType || outOfAttempts}
            >
              {submitting ? <><CircleNotch size={18} className="idv-spin" /> Verifying...</> : 'Verify identity'}
            </button>
            {outOfAttempts && <span className="idv-attempts">Daily attempt limit reached. Try again tomorrow.</span>}
          </div>
        </FormTag>
      )}

      {cameraSide && (
        <CameraCapture
          side={cameraSide}
          onClose={closeCamera}
          onCapture={(captured) => {
            pickFile(cameraSide, captured);
            setCameraSide(null);
          }}
        />
      )}
    </div>
  );
}
