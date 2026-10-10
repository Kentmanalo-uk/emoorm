import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Camera, X, CircleNotch, Plus } from '@phosphor-icons/react';
import { uploadImage } from '../../../lib/upload';
import { resolveImg } from '../../../lib/media';
import { MAX_IMAGES } from './formState';

/**
 * The product's photos: one big box to tap for the first photo, then the
 * first photo large with small tiles for the others. Any photo can be
 * made the first one (the one buyers see first).
 */
export default function PhotoPicker({ images, onChange, invalid = false }) {
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
        toast.error(err.message || 'A photo could not be added. Please try again.');
      }
      setUploading((n) => Math.max(0, n - 1));
    }
    setUploading(0);
    if (uploaded.length) onChange([...list, ...uploaded]);
  };

  const makeFirst = (idx) => {
    const next = [...list];
    const [picked] = next.splice(idx, 1);
    onChange([picked, ...next]);
  };

  const removeAt = (idx) => onChange(list.filter((_, i) => i !== idx));
  const pick = () => inputRef.current?.click();
  const canAdd = list.length + uploading < MAX_IMAGES && !uploading;

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
        <button type="button" className={`pf-photo-empty${invalid ? ' is-invalid' : ''}`} onClick={pick}>
          <span className="pf-photo-empty-icon"><Camera size={30} /></span>
          <strong>Add a photo — tap here</strong>
          <small>Take a photo, or choose one from your phone or computer.</small>
        </button>
      ) : (
        <div className="pf-photos">
          {list.map((src, idx) => (
            <div key={`${src}-${idx}`} className={`pf-photo${idx === 0 ? ' is-cover' : ''}`}>
              <img src={resolveImg(src) || src} alt={idx === 0 ? 'First photo' : `Photo ${idx + 1}`} />
              <button type="button" className="pf-photo-remove" onClick={() => removeAt(idx)} aria-label={`Remove photo ${idx + 1}`}>
                <X size={15} weight="bold" />
              </button>
              {idx === 0
                ? <span className="pf-photo-cover">First photo</span>
                : <button type="button" className="pf-photo-makecover" onClick={() => makeFirst(idx)}>Make first</button>}
            </div>
          ))}
          {uploading > 0 && (
            <div className="pf-photo pf-photo--loading" aria-live="polite">
              <CircleNotch size={22} className="pf-spin" />
              <span>Adding…</span>
            </div>
          )}
          {canAdd && (
            <button type="button" className="pf-photo-add" onClick={pick}>
              <Plus size={22} />
              <span>Add more</span>
              <small>{list.length} of {MAX_IMAGES}</small>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
