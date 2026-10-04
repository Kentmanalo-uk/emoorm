import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from '@phosphor-icons/react';
import axios from '../../lib/axios';
import useAuthStore from '../../store/authStore';
import { isOpen } from '../../lib/availability';
import TodayCard from './TodayCard';
import './TodayRail.css';

/**
 * Home's "Available Today": what local shops sell fresh for a limited time,
 * near the buyer's town first (all towns when there is nothing near). Hidden
 * when nothing is on, or when the feature is switched off. Laid out like the
 * other Home sections: a plain title, an arrow to the full list, one row.
 */
export default function TodayRail() {
  const townId = useAuthStore((s) => s.user?.municipalityId) || null;
  const [items, setItems] = useState(null);
  // Nothing near: all towns are shown, and "See all" opens all towns too.
  const [allTowns, setAllTowns] = useState(false);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const near = townId ? (await axios.get('/today', { params: { near: townId, pageSize: 12 }, quiet: true })).data : null;
        let list = near?.items || [];
        let wide = !townId;
        if (!list.length && near?.enabled !== false) {
          list = (await axios.get('/today', { params: { pageSize: 12 }, quiet: true })).data?.items || [];
          wide = true;
        }
        if (live) { setItems(list); setAllTowns(wide); }
      } catch {
        if (live) setItems([]);
      }
    };
    load();
    return () => { live = false; };
  }, [townId]);

  // A window can end while the page is open: only what still takes orders.
  const shown = (items || []).filter((w) => isOpen(w));
  if (!shown.length) return null;

  return (
    <section className="today-rail" aria-labelledby="today-rail-title">
      <div className="container">
        <div className="section-header">
          <div className="today-rail-titles">
            <h2 className="section-title title-medium" id="today-rail-title">Available Today</h2>
            <p className="today-rail-sub">Fresh from local shops, for a limited time</p>
          </div>
          <Link to={allTowns && townId ? '/today?town=all' : '/today'} className="section-arrow-link" aria-label="See all available today" title="See all">
            <ArrowRight size={19} />
          </Link>
        </div>
        <div className="today-rail-row">
          {shown.map((item) => <TodayCard key={item.id} item={item} />)}
        </div>
      </div>
    </section>
  );
}
