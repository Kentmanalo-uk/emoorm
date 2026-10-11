import { useCallback, useEffect, useRef, useState } from 'react';
import { frameToJpeg } from './imageSearch';

/*
 * The device camera in a <video>, for search by image.
 *
 *   const cam = useCamera({ active, facing: 'back' | 'front' });
 *   <video ref={cam.attachVideo} playsInline muted autoPlay />
 *
 * status: 'idle' (not asked), 'starting' (asking / opening), 'live',
 * 'denied' (the person or the browser said no), 'unavailable' (no camera,
 * or a page the browser won't open one on, such as plain http).
 * The camera is let go as soon as `active` turns false or the page closes.
 */

export const cameraSupported = () => typeof navigator !== 'undefined'
  && Boolean(navigator.mediaDevices?.getUserMedia);

/** Whether this device has a camera at all (without asking for it). */
export async function hasCamera() {
  if (!cameraSupported()) return false;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some((d) => d.kind === 'videoinput');
  } catch {
    return false;
  }
}

export default function useCamera({ active, facing = 'back' }) {
  const videoEl = useRef(null);
  const streamRef = useRef(null);
  // A callback ref: a <video> shown after the camera opened gets it too.
  const attachVideo = useCallback((el) => {
    videoEl.current = el;
    if (el && streamRef.current && el.srcObject !== streamRef.current) {
      el.srcObject = streamRef.current;
      el.play?.().catch(() => {});
    }
  }, []);
  const [attempt, setAttempt] = useState(0);
  // What the last request for the camera came to, for that facing and attempt.
  const want = `${facing}:${attempt}`;
  const [result, setResult] = useState({ want: '', status: 'starting', torchSupported: false });
  const [torch, setTorchOn] = useState({ want: '', on: false });

  useEffect(() => {
    if (!active || !cameraSupported()) return undefined;
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: facing === 'front' ? 'user' : 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    }).then((stream) => {
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoEl.current;
      if (video) {
        video.srcObject = stream;
        video.play?.().catch(() => {});
      }
      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() || {};
      setResult({ want, status: 'live', torchSupported: Boolean(caps.torch) });
    }).catch((err) => {
      if (cancelled) return;
      const name = err?.name || '';
      setResult({ want, status: name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable', torchSupported: false });
    });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoEl.current) videoEl.current.srcObject = null;
    };
  }, [active, facing, want]);

  let status = 'idle';
  if (active) {
    if (!cameraSupported()) status = 'unavailable';
    else status = result.want === want ? result.status : 'starting';
  }
  const torchSupported = status === 'live' && result.torchSupported;

  /** Ask again (after "Allow camera"). */
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const setTorch = useCallback((on) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track?.applyConstraints) return;
    track.applyConstraints({ advanced: [{ torch: on }] })
      .then(() => setTorchOn({ want, on }))
      .catch(() => {});
  }, [want]);

  /** The frame on screen now, as a JPEG File (null if the camera isn't showing anything). */
  const capture = useCallback(async () => {
    const video = videoEl.current;
    if (!video || !video.videoWidth) return null;
    return frameToJpeg(video, video.videoWidth, video.videoHeight);
  }, []);

  return {
    attachVideo, status, retry, capture, torch: torchSupported && torch.want === want && torch.on, torchSupported, setTorch,
  };
}
