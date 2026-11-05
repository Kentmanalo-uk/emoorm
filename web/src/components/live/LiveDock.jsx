import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X } from '../../lib/icons';
import { LIVE_BASE, LivePlayer, getLive } from '../../lib/live';
import { undockLive, useDockedLive } from '../../lib/liveDock';
import './LiveDock.css';

/**
 * The live a shopper stepped away from, still playing in a small window in
 * the corner (lib/liveDock): tap it to go back, × to close it. It goes away
 * by itself when the live ends.
 */
export default function LiveDock() {
  const docked = useDockedLive();
  const { pathname } = useLocation();
  const hidden = !docked || pathname.startsWith('/live/') || pathname.startsWith('/seller');
  if (hidden) return null;
  return <DockedPlayer key={docked.id} live={docked} />;
}

function DockedPlayer({ live }) {
  const navigate = useNavigate();
  const video = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let player = null;
    let cancelled = false;
    getLive(live.id)
      .then((info) => {
        if (cancelled) return;
        if (info.status === 'ENDED') { undockLive(); return; }
        player = new LivePlayer(video.current, {
          base: LIVE_BASE,
          id: live.id,
          onState: (state) => {
            if (state === 'playing') setReady(true);
            if (state === 'ended' || state === 'unsupported') undockLive();
          },
        });
        player.start(info);
      })
      .catch(() => undockLive());
    return () => {
      cancelled = true;
      player?.destroy();
    };
  }, [live.id]);

  return (
    <div className={`ldock${ready ? ' is-ready' : ''}`}>
      <button type="button" className="ldock-open" onClick={() => navigate(`/live/${live.id}`)} aria-label={`Back to ${live.store?.name || 'the'} live`}>
        <video ref={video} playsInline autoPlay />
        <span className="ldock-live">LIVE</span>
      </button>
      <button type="button" className="ldock-close" onClick={undockLive} aria-label="Close the live"><X size={14} weight="bold" /></button>
    </div>
  );
}
