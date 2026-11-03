import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import toast from 'react-hot-toast';
import {
  ArrowArcLeft, ArrowArcRight, ArrowLeft, CircleNotch, FloppyDisk, ImageSquare, Rows, SquaresFour, Storefront, Tag, Trash,
} from '../../../lib/icons';
import { resolveImg } from '../../../lib/media';
import { uploadImage } from '../../../lib/upload';
import { IMAGE_ACCEPT } from '../../../lib/uploadableImage';
import { MAX_LAYERS, blankLayer, newId, textOf } from '../../../lib/photoDesign';
import DesignCanvas from './DesignCanvas';
import DesignInspector from './DesignInspector';
import './DesignEditor.css';

const LABELS = {
  text: 'Text', logo: 'Logo', shape: 'Shape', image: 'Picture',
};

const naturalRatio = (url) => new Promise((resolve) => {
  const img = new window.Image();
  img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1);
  img.onerror = () => resolve(1);
  img.src = url;
});

/**
 * The photo design editor: the design on one of the shop's photos (or
 * plain), the pieces to add, the picked piece's settings and the list of
 * pieces. Undo and Redo, keyboard nudges (arrows, Delete, Ctrl+Z, Ctrl+D).
 */
export default function DesignEditor({
  initial, store, photos = [], saving = false, onSave, onBack, onDelete,
}) {
  const [name, setName] = useState(initial.name);
  const [doc, setDoc] = useState({ past: [], present: initial.layers, future: [] });
  const [selectedId, setSelectedId] = useState(initial.layers[0]?.id || null);
  const [photo, setPhoto] = useState(photos[0] || null);
  const [tall, setTall] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);
  const replacing = useRef(null);
  const layers = doc.present;
  const selected = layers.find((l) => l.id === selectedId) || null;
  const canAdd = layers.length < MAX_LAYERS;
  const dirty = doc.past.length > 0 || name !== initial.name;

  const change = useCallback((next, { record = true } = {}) => {
    setDoc((d) => (record
      ? { past: [...d.past.slice(-59), d.present], present: next, future: [] }
      : { ...d, present: next }));
  }, []);
  // The step before a slider's drag or typing starts.
  const mark = useCallback(() => {
    setDoc((d) => ({ past: [...d.past.slice(-59), d.present], present: d.present, future: [] }));
  }, []);
  const undo = useCallback(() => setDoc((d) => (d.past.length
    ? { past: d.past.slice(0, -1), present: d.past[d.past.length - 1], future: [d.present, ...d.future] }
    : d)), []);
  const redo = useCallback(() => setDoc((d) => (d.future.length
    ? { past: [...d.past, d.present], present: d.future[0], future: d.future.slice(1) }
    : d)), []);

  const set = (patch, { record = true } = {}) => {
    if (!selected) return;
    change(layers.map((l) => (l.id === selected.id ? { ...l, ...patch } : l)), { record });
  };
  const add = (layer) => {
    if (!canAdd || !layer) return;
    change([...layers, layer]);
    setSelectedId(layer.id);
  };
  const remove = (id = selectedId) => {
    if (!id) return;
    change(layers.filter((l) => l.id !== id));
    setSelectedId(null);
  };
  const duplicate = () => {
    if (!selected || !canAdd) return;
    const copy = {
      ...selected, id: newId(), x: Math.min(100, selected.x + 4), y: Math.min(100, selected.y + 4),
    };
    add(copy);
  };
  const move = (id, by) => {
    const at = layers.findIndex((l) => l.id === id);
    const to = at + by;
    if (at < 0 || to < 0 || to >= layers.length) return;
    const next = [...layers];
    [next[at], next[to]] = [next[to], next[at]];
    change(next);
  };

  const pickPicture = (replaceId = null) => {
    replacing.current = replaceId;
    fileInput.current?.click();
  };
  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadImage(file);
      const ar = Math.round((await naturalRatio(resolveImg(url) || url)) * 100) / 100;
      if (replacing.current) {
        change(layers.map((l) => (l.id === replacing.current ? { ...l, url, ar } : l)));
      } else {
        add(blankLayer('image', store, { url, ar, w: ar >= 1 ? 30 : Math.round(30 * ar) }));
      }
    } catch (err) {
      toast.error(err.message || 'Could not upload that picture');
    } finally {
      setUploading(false);
    }
  };

  // Keyboard: arrows nudge, Delete removes, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, Ctrl+D.
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== 'range';
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        if (typing) return;
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        if (typing) return;
        e.preventDefault();
        redo();
      } else if (typing) {
        // nothing else while typing
      } else if (mod && e.key.toLowerCase() === 'd' && selectedId) {
        e.preventDefault();
        duplicate();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        remove();
      } else if (e.key === 'Escape') {
        setSelectedId(null);
      } else if (selected && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const by = e.shiftKey ? 2 : 0.5;
        const dx = e.key === 'ArrowLeft' ? -by : e.key === 'ArrowRight' ? by : 0;
        const dy = e.key === 'ArrowUp' ? -by : e.key === 'ArrowDown' ? by : 0;
        set({ x: Math.min(100, Math.max(0, selected.x + dx)), y: Math.min(100, Math.max(0, selected.y + dy)) });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = () => {
    if (!name.trim()) {
      toast.error('Give the design a name');
      return;
    }
    if (!layers.length) {
      toast.error('Add at least one piece first');
      return;
    }
    onSave({ name: name.trim(), layers });
  };

  const addButtons = [
    { key: 'text', label: 'Text', icon: <span className="pde-glyph">Aa</span>, make: () => blankLayer('text', store) },
    { key: 'name', label: 'Shop name', icon: <Tag size={18} />, make: () => blankLayer('name', store, { y: 88 }) },
    { key: 'logo', label: 'Logo', icon: <Storefront size={18} />, make: () => blankLayer('logo', store, { x: 16, y: 84 }) },
    { key: 'shape', label: 'Shape', icon: <SquaresFour size={18} />, make: () => blankLayer('shape', store) },
    { key: 'bar', label: 'Bar', icon: <Rows size={18} />, make: () => blankLayer('shape', store, { y: 92, w: 100, h: 14, radius: 0, span: 'x' }) },
  ];

  return (
    <div className="pde">
      <div className="pde-top">
        <button type="button" className="pde-icon-btn" onClick={() => onBack(dirty)} aria-label="Back to your designs">
          <ArrowLeft size={20} />
        </button>
        <input
          className="pde-name"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name this design"
          aria-label="Design name"
        />
        <div className="pde-top-actions">
          <button type="button" className="pde-icon-btn" onClick={undo} disabled={!doc.past.length} aria-label="Undo" title="Undo (Ctrl+Z)">
            <ArrowArcLeft size={19} />
          </button>
          <button type="button" className="pde-icon-btn" onClick={redo} disabled={!doc.future.length} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
            <ArrowArcRight size={19} />
          </button>
          {onDelete && (
            <button type="button" className="pde-icon-btn is-danger" onClick={onDelete} aria-label="Delete design" title="Delete design">
              <Trash size={18} />
            </button>
          )}
          <button type="button" className="pde-save" onClick={save} disabled={saving}>
            {saving ? <CircleNotch size={17} className="pde-spin" /> : <FloppyDisk size={17} />}
            Save
          </button>
        </div>
      </div>

      <div className="pde-body">
        <section className="pde-work" aria-label="Design">
          <div className="pde-add" role="toolbar" aria-label="Add a piece">
            {addButtons.map((b) => (
              <button key={b.key} type="button" className="pde-add-btn" disabled={!canAdd} onClick={() => add(b.make())}>
                {b.icon}
                <span>{b.label}</span>
              </button>
            ))}
            <button type="button" className="pde-add-btn" disabled={!canAdd || uploading} onClick={() => pickPicture()}>
              {uploading ? <CircleNotch size={18} className="pde-spin" /> : <ImageSquare size={18} />}
              <span>Picture</span>
            </button>
            <input ref={fileInput} type="file" accept={IMAGE_ACCEPT} hidden onChange={onFile} />
          </div>

          <DesignCanvas
            layers={layers}
            store={store}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={change}
            photo={photo}
            tall={tall}
          />

          <div className="pde-view">
            <div className="pde-chips" role="radiogroup" aria-label="Preview as">
              <button type="button" role="radio" aria-checked={!tall} className={`pde-chip${!tall ? ' is-on' : ''}`} onClick={() => setTall(false)}>Card</button>
              <button type="button" role="radio" aria-checked={tall} className={`pde-chip${tall ? ' is-on' : ''}`} onClick={() => setTall(true)}>Product page</button>
            </div>
            <span className="pde-count">{`${layers.length}/${MAX_LAYERS} pieces`}</span>
          </div>

          {photos.length > 0 && (
            <div className="pde-photos" role="radiogroup" aria-label="Try it on">
              <span className="pde-label">Try it on</span>
              <div className="pde-photo-row">
                <button type="button" role="radio" aria-checked={!photo} className={`pde-photo-pick is-blank${!photo ? ' is-on' : ''}`} onClick={() => setPhoto(null)} aria-label="Plain" />
                {photos.map((p) => (
                  <button key={p} type="button" role="radio" aria-checked={photo === p} className={`pde-photo-pick${photo === p ? ' is-on' : ''}`} onClick={() => setPhoto(p)}>
                    <img src={resolveImg(p) || p} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="pde-side">
          <DesignInspector
            layer={selected}
            store={store}
            set={set}
            mark={mark}
            canAdd={canAdd}
            onForward={() => selected && move(selected.id, 1)}
            onBack={() => selected && move(selected.id, -1)}
            onDuplicate={duplicate}
            onDelete={() => remove()}
            onReplaceImage={() => selected && pickPicture(selected.id)}
          />

          {layers.length > 0 && (
            <div className="pde-layers">
              <span className="pde-label">Pieces <em>(top first)</em></span>
              <ul>
                {[...layers].reverse().map((l) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      className={`pde-layer${l.id === selectedId ? ' is-on' : ''}`}
                      onClick={() => setSelectedId(l.id)}
                    >
                      <span className="pde-layer-kind">{l.type === 'text' && l.bind === 'name' ? 'Name' : LABELS[l.type]}</span>
                      <span className="pde-layer-text">{l.type === 'text' ? textOf(l, store) : ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
