import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Camera, X, CircleNotch } from '@phosphor-icons/react';
import { uploadImage } from '../../../lib/upload';
import { resolveImg } from '../../../lib/media';
import { MAX_IMAGES } from './formState';

/** The product's photos: add from the camera or gallery, remove, pick the cover. */
export default function PhotoPicker({ images, onChange, empty = 'Add photos' }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(0);
  const list = Array.isArray(images) ? images : [];

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (inputRef.current) inputRef.current.value = '';
    if (!files.length) return;
    const room = MAX_IMAGES - list.length;
    if (room <= 0) {
      toast.error(`You can add up to ${MAX_IMAGES} photos`);
      return;
    }
    const chosen = files.slice(0, room);
    if (files.length > room) toast(`Only ${room} more photo${room === 1 ? '' : 's'} can be added`);

    setUploading(chosen.length);
    const uploaded = [];
    for (const file of chosen) {
      try {
        const res = await uploadImage(file);
        uploaded.push(res.url);
      } catch (err) {
        toast.error(err.message || 'A photo could not be uploaded');
      }
      setUploading((n) => Math.max(0, n - 1));
    }
    setUploading(0);
    if (uploaded.length) onChange([...list, ...uploaded]);
  };

  const makeCover = (idx) => {
    const next = [...list];
    const [picked] = next.splice(idx, 1);
    onChange([picked, ...next]);
  };

  const removeAt = (idx) => onChange(list.filter((_, i) => i !== idx));
  const pick = () => inputRef.current?.click();

  return (
    <div className="pf-photos-wrap">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        multiple
        onChange={handleFiles}
        hidden
      />
      {list.length === 0 && !uploading ? (
        <button type="button" className="pf-photo-empty" onClick={pick}>
          <span className="pf-photo-empty-icon"><Camera size={26} /></span>
          <strong>{empty}</strong>
          <small>Take a photo or choose from your gallery · up to {MAX_IMAGES}</small>
        </button>
      ) : (
        <div className="pf-photos">
          {list.map((src, idx) => (
            <div key={`${src}-${idx}`} className={`pf-photo${idx === 0 ? ' is-cover' : ''}`}>
              <img src={resolveImg(src) || src} alt={`Photo ${idx + 1}`} />
              <button type="button" className="pf-photo-remove" onClick={() => removeAt(idx)} aria-label={`Remove photo ${idx + 1}`}>
                <X size={14} weight="bold" />
              </button>
              {idx === 0
                ? <span className="pf-photo-cover">Cover</span>
                : <button type="button" className="pf-photo-makecover" onClick={() => makeCover(idx)}>Make cover</button>}
            </div>
          ))}
          {uploading > 0 && (
            <div className="pf-photo pf-photo--loading" aria-live="polite">
              <CircleNotch size={22} className="pf-spin" />
              <span>Uploading…</span>
            </div>
          )}
          {list.length + uploading < MAX_IMAGES && !uploading && (
            <button type="button" className="pf-photo-add" onClick={pick}>
              <Camera size={22} />
              <span>Add photo</span>
              <small>{list.length}/{MAX_IMAGES}</small>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
