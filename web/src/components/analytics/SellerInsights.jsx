import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUp, ArrowDown, CaretRight } from '../../lib/icons';
import axios from '../../lib/axios';
import { resolveImg } from '../../lib/media';
import { readCache, writeCache } from '../../lib/pageCache';
import { shortDay } from '../../lib/manilaDays';
import KpiCard from './KpiCard';
import EmptyState from './EmptyState';
import { peso, num } from './format';
import './analytics.css';
import './SellerInsights.css';

/*
 * Seller Center › Analytics › Insights: what the ML engine (backend/src/ml,
 * GET /ml/insights/mine) works out for the shop: a sales forecast, stock that
 * could run out, buyer groups, products viewed but not bought, and bundle
 * ideas (GET /ml/bundles/mine). About now and next, so not tied to the
 * page's date range.
 *
 * A card whose part is switched off or failed ('off', 'unavailable') is not
 * shown; one without enough data says what it needs. The whole section is
 * hidden while every part is off, and when the insights cannot be loaded.
 * It sits at the end of the page and shows what it showed last time at
 * once, so its arrival never moves the cards above it.
 */

const CACHE_KEY = 'seller:insights';
const LIST_LIMIT = 6;

const shown = (part) => Boolean(part) && part.status !== 'off' && part.status !== 'unavailable';
const plural = (n, one, many = `${one}s`) => `${num(n)} ${Number(n) === 1 ? one : many}`;
const pct = (fraction) => {
  const v = Number(fraction || 0) * 100;
  return `${v > 0 && v < 10 ? v.toFixed(1).replace(/\.0$/, '') : Math.round(v)}%`;
};

/** Units as a seller would say them: "about 4", "under 1", "none". */
const aboutUnits = (v) => {
  const n = Number(v || 0);
  if (n <= 0) return 'none';
  if (n < 1) return 'under 1';
  return `about ${num(Math.round(n))}`;
};
const rangeUnits = (r) => `${num(Math.floor(r?.low || 0))}–${num(Math.ceil(r?.high || 0))}`;

function Thumb({ image }) {
  const src = resolveImg(image);
  return (
    <span className="an-toplist-thumb">
      {src ? <img src={src} alt="" loading="lazy" /> : <span className="an-toplist-thumb-fallback" />}
    </span>
  );
}

/** "Show all 14" under a list cut short. */
function MoreToggle({ total, open, onToggle }) {
  if (total <= LIST_LIMIT) return null;
  return (
    <button type="button" className="san-more" onClick={onToggle} aria-expanded={open}>
      {open ? 'Show fewer' : `Show all ${num(total)}`}
    </button>
  );
}

/**
 * Weekly units sold (oldest first) as a line, and the coming week's forecast
 * as a dashed step to a dot, with its likely range as a faint bar.
 */
function Sparkline({ weekly = [], next }) {
  const history = weekly.map((v) => Number(v) || 0);
  const w = 120;
  const h = 34;
  const pad = 3;
  const n = history.length;
  const max = Math.max(1, ...history, Number(next?.high) || 0);
  const x = (i) => (n ? (i / n) * (w - pad * 2) + pad : w / 2);
  const y = (v) => h - pad - (v / max) * (h - pad * 2);
  const line = history.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const fx = x(n);
  const label = `Weekly sales, last ${plural(n, 'week')}: ${history.join(', ')}. Next week ${aboutUnits(next?.units)}.`;
  return (
    // Stretched to its box on phones: strokes keep their width, and the dot
    // is a round-capped dot of a line so it stays round.
    <svg className="san-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <line className="san-spark-base" x1={pad} x2={w - pad} y1={h - pad} y2={h - pad} vectorEffect="non-scaling-stroke" />
      {n > 1 && <path className="san-spark-line" d={line} vectorEffect="non-scaling-stroke" />}
      {next && (
        <>
          <line className="san-spark-range" x1={fx} x2={fx} y1={y(next.low || 0)} y2={y(next.high || 0)} vectorEffect="non-scaling-stroke" />
          {n > 0 && <line className="san-spark-next" x1={x(n - 1)} y1={y(history[n - 1])} x2={fx} y2={y(next.units || 0)} vectorEffect="non-scaling-stroke" />}
          <line className="san-spark-dot" x1={fx} x2={fx} y1={y(next.units || 0)} y2={y(next.units || 0)} vectorEffect="non-scaling-stroke" />
        </>
      )}
    </svg>
  );
}

// ── 1. Sales forecast ──────────────────────────────────────────────────────

function ForecastKpis({ forecast }) {
  // Nothing expected at all (recent weeks sold nothing): no ₱0 figures.
  if (forecast?.status !== 'ok' || !(Number(forecast.sales30?.high) > 0)) return null;
  const hint = (s) => (Number(s?.high) > 0
    ? `Likely between ${peso(s.low)} and ${peso(s.high)}, at today's prices`
    : 'Your recent weeks had no sales to go on');
  return (
    <div className="an-kpi-grid san-kpis">
      <KpiCard label="Expected sales, next 7 days" value={peso(forecast.sales7?.amount)} hint={hint(forecast.sales7)} />
      <KpiCard label="Expected sales, next 30 days" value={peso(forecast.sales30?.amount)} hint={hint(forecast.sales30)} />
    </div>
  );
}

function ShortList({ title, items, icon, tone }) {
  if (!items?.length) return null;
  return (
    <div className="san-trend-list">
      <h3 className={`san-trend-title is-${tone}`}>{icon}{title}</h3>
      <ul>
        {items.map((p) => (
          <li key={p.id}>
            <Thumb image={p.image} />
            <span className="an-toplist-name">{p.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ForecastCard({ forecast }) {
  const [open, setOpen] = useState(false);
  const products = forecast.products || [];
  const list = open ? products : products.slice(0, LIST_LIMIT);
  return (
    <div className="an-card san-forecast">
      <div className="an-card-head">
        <h2 className="an-card-title">Sales forecast</h2>
        <span className="an-card-sub">From each product&apos;s weekly sales. Estimates, not promises</span>
      </div>
      {forecast.status === 'insufficient' ? (
        <EmptyState
          art="analytics"
          title="Not enough sales for a forecast yet"
          message={`A product gets a forecast once it has about ${plural(forecast.needs?.weeks ?? 6, 'week')} of sales and at least ${plural(forecast.needs?.units ?? 6, 'unit')} sold.`}
          compact
        />
      ) : (
        <>
          <div className="san-fc-legend" aria-hidden="true">
            <span><i className="is-line" /> Sold each week</span>
            <span><i className="is-dot" /> Next week, likely range</span>
          </div>
          <ul className="an-toplist">
            {list.map((p) => {
              const checked = p.validation
                ? `Checked on its last 4 weeks: off by about ${p.validation.mae} a week${p.baseline ? ` (repeating last week: ${p.baseline.mae})` : ''}.`
                : 'Under 10 weeks of sales, so this is a rough first guess.';
              return (
                <li key={p.id} className="an-toplist-row san-fc-row">
                  <Thumb image={p.image} />
                  <span className="an-toplist-body">
                    <span className="an-toplist-name">{p.name}</span>
                    <span className="an-toplist-sub">
                      {Number(p.prepare) > 0 ? `Prepare about ${num(p.prepare)} for the week` : 'No sales expected this week'}
                      {p.status === 'early' && <span className="san-tag" title={checked}>Early estimate</span>}
                    </span>
                  </span>
                  <Sparkline weekly={p.weekly} next={p.next7} />
                  <span className="san-fc-metric" title={checked}>
                    <strong>{aboutUnits(p.next7?.units)}</strong>
                    <small>{Number(p.next7?.high) > 0 ? `next 7 days, likely ${rangeUnits(p.next7)}` : 'next 7 days'}</small>
                  </span>
                </li>
              );
            })}
          </ul>
          <MoreToggle total={products.length} open={open} onToggle={() => setOpen((v) => !v)} />
          {(forecast.rising?.length > 0 || forecast.falling?.length > 0) && (
            <div className="san-trends">
              <ShortList title="Selling more lately" items={forecast.rising} tone="up" icon={<ArrowUp size={13} weight="bold" />} />
              <ShortList title="Selling less lately" items={forecast.falling} tone="down" icon={<ArrowDown size={13} weight="bold" />} />
            </div>
          )}
          {forecast.withoutForecast > 0 && (
            <p className="san-note">
              {plural(forecast.withoutForecast, 'other product')} {forecast.withoutForecast === 1 ? 'has' : 'have'} too few sales for a forecast yet.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── 2. Stock risk ──────────────────────────────────────────────────────────

const RISKS = {
  OUT: { label: 'Out of stock', count: 'out', tone: 'danger' },
  HIGH: { label: 'Runs out this week', count: 'high', tone: 'warning' },
  MEDIUM: { label: 'Within 2 weeks', count: 'medium', tone: 'neutral' },
  LOW: { label: 'Enough for now', count: 'low', tone: 'ok' },
};

const daysLeftText = (p) => {
  if (p.risk === 'OUT') return 'None left';
  if (p.daysLeft == null) return '—';
  if (p.daysLeft < 1) return 'Under a day';
  return `About ${plural(Math.round(p.daysLeft), 'day')}`;
};

const paceText = (p) => {
  const rate = Number(p.ratePerDay || 0);
  if (!(rate > 0)) return 'No recent sales';
  const every = Math.round(1 / rate);
  let pace = `Sells about 1 every ${num(every)} days`;
  if (rate >= 1.5) pace = `Sells about ${num(rate)} a day`;
  else if (every <= 1) pace = 'Sells about 1 a day';
  return `${pace}, ${p.basis === 'forecast' ? 'by its forecast' : 'over the last 4 weeks'}`;
};

function StockCard({ stock }) {
  const [open, setOpen] = useState(false);
  const counts = stock.counts || {};
  const rows = (stock.products || []).filter((p) => RISKS[p.risk]);
  const list = open ? rows : rows.slice(0, LIST_LIMIT);
  return (
    <div className="an-card san-stock">
      <div className="an-card-head">
        <h2 className="an-card-title">Stock risk</h2>
        <span className="an-card-sub">When each product could run out if it keeps selling as it does</span>
      </div>
      {stock.status === 'insufficient' ? (
        <EmptyState
          art="products"
          title="No stock outlook yet"
          message="Products that keep stock are checked once a day. Check back tomorrow."
          compact
        />
      ) : (
        <>
          {rows.length ? (
            <>
              <ul className="san-risk-counts" aria-label="Products by stock risk">
                {Object.entries(RISKS).map(([key, r]) => (
                  <li key={key} className={`san-count${Number(counts[r.count]) > 0 ? ` is-${r.tone}` : ''}`}>
                    <strong>{num(counts[r.count])}</strong>
                    <span>{r.label}</span>
                  </li>
                ))}
              </ul>
              <div className="san-stock-table" role="table" aria-label="Stock risk by product">
                <div className="san-stock-row is-head" role="row">
                  <span role="columnheader">Product</span>
                  <span role="columnheader">Stock</span>
                  <span role="columnheader">Days left</span>
                  <span role="columnheader">Runs out</span>
                  <span role="columnheader">Restock</span>
                  <span role="columnheader">Risk</span>
                  <span role="columnheader"><span className="sr-only">Action</span></span>
                </div>
                {list.map((p) => (
                  <div key={p.id} className="san-stock-row" role="row">
                    <span className="san-stock-product" role="cell">
                      <Thumb image={p.image} />
                      <span className="an-toplist-body">
                        <span className="an-toplist-name">{p.name}</span>
                        <span className="an-toplist-sub">{paceText(p)}</span>
                      </span>
                    </span>
                    <span className="san-stock-cell" role="cell"><small>Stock</small>{num(p.stock)}</span>
                    <span className="san-stock-cell" role="cell"><small>Days left</small>{daysLeftText(p)}</span>
                    <span className="san-stock-cell" role="cell">
                      <small>Runs out</small>
                      {p.risk === 'OUT' ? 'Already out' : (p.runsOutOn ? shortDay(p.runsOutOn) : '—')}
                    </span>
                    <span className="san-stock-cell" role="cell">
                      <small>Restock</small>
                      {Number(p.restock) > 0 ? `Add about ${num(p.restock)}` : '—'}
                    </span>
                    <span className="san-stock-cell is-risk" role="cell">
                      <span className={`san-risk is-${RISKS[p.risk].tone}`}>{RISKS[p.risk].label}</span>
                    </span>
                    <span className="san-stock-cell is-action" role="cell">
                      <Link to={`/seller/products?restock=${p.id}`} className="an-icon-btn san-row-btn" aria-label={`Restock ${p.name}`}>
                        Restock <CaretRight size={13} weight="bold" />
                      </Link>
                    </span>
                  </div>
                ))}
              </div>
              <MoreToggle total={rows.length} open={open} onToggle={() => setOpen((v) => !v)} />
              <p className="san-note">
                Suggested restock covers about 30 days of sales.
                {counts.noSales > 0 && ` ${plural(counts.noSales, 'product')} with no sales in the last 4 weeks ${counts.noSales === 1 ? 'is' : 'are'} not listed.`}
              </p>
            </>
          ) : (
            <EmptyState
              art="healthy"
              title="Nothing at risk"
              message={counts.noSales > 0
                ? `None of your products is selling fast enough to run out soon. ${plural(counts.noSales, 'product')} had no sales in the last 4 weeks.`
                : 'None of your products is selling fast enough to run out soon.'}
              compact
            />
          )}
        </>
      )}
    </div>
  );
}

// ── 3. Buyer groups ────────────────────────────────────────────────────────

const GROUPS = [
  { key: 'new', label: 'New', about: 'First order in the last 30 days' },
  { key: 'frequent', label: 'Frequent', about: '3 or more orders, the last within 2 months' },
  { key: 'high_value', label: 'High spenders', about: 'Your top quarter by spend, ordered within 3 months' },
  { key: 'returning', label: 'Returning', about: 'Ordered twice or more, the last within 3 months' },
  { key: 'occasional', label: 'Occasional', about: 'One order, 1 to 4 months ago' },
  { key: 'inactive', label: 'Inactive', about: 'No order in over 4 months' },
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (ym) => MONTHS[Number(String(ym).slice(5, 7)) - 1] || ym;

function MonthsChart({ months }) {
  if (!months?.length) return null;
  const max = Math.max(1, ...months.map((m) => Math.max(m.new || 0, m.returning || 0)));
  const bar = (v) => `${Math.max(2, ((v || 0) / max) * 100)}%`;
  return (
    <div className="san-months-wrap">
      <div className="san-months-head">
        <h3>New and returning buyers</h3>
        <span className="san-months-legend" aria-hidden="true">
          <span><i className="is-new" /> New</span>
          <span><i className="is-returning" /> Returning</span>
        </span>
      </div>
      <div className="san-months">
        {months.map((m) => (
          <div
            key={m.month}
            className="san-month"
            role="img"
            aria-label={`${monthName(m.month)}: ${plural(m.new, 'new buyer')}, ${plural(m.returning, 'returning buyer')}`}
            title={`${monthName(m.month)}: ${num(m.new)} new, ${num(m.returning)} returning`}
          >
            <span className="san-month-bars">
              <i className="is-new" style={{ height: bar(m.new) }} />
              <i className="is-returning" style={{ height: bar(m.returning) }} />
            </span>
            <span className="san-month-label">{monthName(m.month)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BuyersCard({ buyers }) {
  const total = Number(buyers.buyers || 0);
  return (
    <div className="an-card san-buyers">
      <div className="an-card-head">
        <h2 className="an-card-title">Buyer groups</h2>
        <span className="an-card-sub">
          {buyers.status === 'ok' ? `Your ${plural(total, 'buyer')} in the last year, by how they buy` : 'How your buyers buy'}
        </span>
      </div>
      {buyers.status === 'insufficient' ? (
        <EmptyState
          art="users"
          title={`Groups show once at least ${plural(buyers.needs ?? 5, 'buyer')} have ordered`}
          message={`So far, ${plural(total, 'buyer')} ${total === 1 ? 'has' : 'have'} completed an order with you this year. Only counts are shown here, never names.`}
          compact
        />
      ) : (
        <>
          <div className="an-chart-summary san-buyer-stats">
            <span><small>Came back</small><strong>{pct(buyers.repeatRate)}</strong></span>
            <span><small>Orders per buyer</small><strong>{Number(buyers.avgOrders || 0).toFixed(1).replace(/\.0$/, '')}</strong></span>
            <span><small>Spend per buyer</small><strong>{peso(buyers.avgSpend)}</strong></span>
          </div>
          <ul className="an-reasons san-groups">
            {GROUPS.map((g) => {
              const count = Number(buyers.groups?.[g.key] || 0);
              return (
                <li key={g.key}>
                  <span className="an-reasons-name">
                    <span className="san-group-name">{g.label}</span>
                    <small>{g.about}</small>
                  </span>
                  <span className="an-reasons-bar" aria-hidden="true"><i style={{ width: `${total ? Math.round((count / total) * 100) : 0}%` }} /></span>
                  <span className="an-reasons-count">{num(count)}</span>
                </li>
              );
            })}
          </ul>
          <MonthsChart months={buyers.months} />
        </>
      )}
    </div>
  );
}

// ── 4. Viewed but not bought ───────────────────────────────────────────────

const hintText = (hint, p) => {
  if (hint === 'photos') return 'Add more photos';
  if (hint === 'description') return 'Write a fuller description';
  if (hint === 'price') return p.categoryMedianPrice ? `Priced above similar products (${peso(p.categoryMedianPrice)})` : 'Priced above similar products';
  if (hint === 'out_of_stock') return 'Out of stock';
  return null;
};

function PerformanceCard({ performance }) {
  const flagged = performance.flagged || [];
  const days = performance.days || 30;
  return (
    <div className="an-card san-perf">
      <div className="an-card-head">
        <h2 className="an-card-title">Viewed but not bought</h2>
        <span className="an-card-sub">{`${plural(performance.views || 0, 'product view')} in the last ${days} days`}</span>
      </div>
      {performance.status === 'insufficient' ? (
        <EmptyState
          art="analytics"
          title={`Shows once your shop has ${num(performance.needs ?? 50)} product views in ${days} days`}
          message={`So far: ${plural(performance.views || 0, 'view')} in the last ${days} days.`}
          compact
        />
      ) : flagged.length ? (
        <ul className="an-toplist">
          {flagged.map((p) => {
            const hints = (p.hints || []).map((h) => hintText(h, p)).filter(Boolean);
            return (
              <li key={p.id} className="an-toplist-row san-perf-row">
                <Thumb image={p.image} />
                <span className="an-toplist-body">
                  <span className="an-toplist-name">{p.name}</span>
                  <span className="an-toplist-sub">
                    {`${plural(p.views, 'view')} · ${plural(p.cartAdds, 'cart add')} · ${plural(p.orders, 'order')}`}
                  </span>
                  {hints.length ? (
                    <ul className="san-hints">
                      {hints.map((h) => <li key={h}>{h}</li>)}
                    </ul>
                  ) : (
                    <span className="san-hints-none">The listing looks complete. A sale or a fresh photo may help.</span>
                  )}
                </span>
                <Link to={`/seller/products?edit=${p.id}`} className="an-icon-btn san-row-btn" aria-label={`Edit ${p.name}`}>
                  Edit <CaretRight size={13} weight="bold" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          art="healthy"
          title="Nothing to fix"
          message={`Products that get views but few orders show up here. ${pct(performance.shopConversion)} of your views led to an order.`}
          compact
        />
      )}
    </div>
  );
}

// ── 5. Bundle ideas (Phase 2) ──────────────────────────────────────────────

const firstImage = (p) => (Array.isArray(p?.images) ? p.images.find(Boolean) : null) || null;
const orderCount = (n) => plural(n, 'order');

/**
 * Pairs of the shop's products bought together, each with "Make a package"
 * (the package form with both ticked).
 */
function BundleIdeas({ data }) {
  const ideas = (data.ideas || []).filter((idea) => idea.products?.length === 2);
  return (
    <div className="an-card san-bundles">
      <div className="an-card-head">
        <h2 className="an-card-title">Bundle ideas</h2>
        <span className="an-card-sub">Products your buyers often order together</span>
      </div>
      {ideas.length ? (
        <ul className="an-toplist">
          {ideas.map((idea) => {
            const [a, b] = idea.products;
            return (
              <li key={`${a.id}-${b.id}`} className="an-toplist-row san-bundle-row">
                <span className="san-bundle-thumbs">
                  <Thumb image={firstImage(a)} />
                  <Thumb image={firstImage(b)} />
                </span>
                <span className="an-toplist-body">
                  <span className="an-toplist-name">{a.name}</span>
                  <span className="an-toplist-name">+ {b.name}</span>
                  <span className="an-toplist-sub">Bought together in {orderCount(idea.orders)}</span>
                </span>
                <Link
                  to="/seller/products/new?type=package"
                  state={{ packageItems: [a, b] }}
                  className="an-icon-btn san-bundle-btn"
                >
                  Make a package
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          art="products"
          title="No bundle ideas yet"
          message={`Ideas show up here once buyers order the same two of your products together in at least ${orderCount(Math.max(2, Number(data.needed?.timesTogether) || 2))}. So far, ${orderCount(data.ordersWithTwoOrMore)} had two or more of your products.`}
          compact
        />
      )}
    </div>
  );
}

// ── The section ────────────────────────────────────────────────────────────

/** Two cards side by side, or one at full width when the other is hidden. */
function Pair({ children }) {
  const cards = children.filter(Boolean);
  if (!cards.length) return null;
  return cards.length > 1 ? <div className="an-grid-2 san-pair">{cards}</div> : cards[0];
}

export default function SellerInsights() {
  // { insights, bundles }: what showed last time, then the fresh answer.
  const [data, setData] = useState(() => readCache(CACHE_KEY) || null);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([axios.get('/ml/insights/mine'), axios.get('/ml/bundles/mine')]).then(([insights, bundles]) => {
      if (cancelled) return;
      if (insights.status === 'rejected') console.error('Failed to load shop insights:', insights.reason);
      if (bundles.status === 'rejected') console.error('Failed to load bundle ideas:', bundles.reason);
      const next = {
        insights: insights.status === 'fulfilled' ? insights.value?.data || null : null,
        bundles: bundles.status === 'fulfilled' ? bundles.value?.data || null : null,
      };
      setData(next);
      writeCache(CACHE_KEY, next);
    });
    return () => { cancelled = true; };
  }, []);

  const insights = data?.insights || {};
  const bundles = data?.bundles?.on ? data.bundles : null;
  const { forecast, stock, buyers, performance } = insights;
  const any = [forecast, stock, buyers, performance].some(shown) || Boolean(bundles);
  if (!any) return null;

  return (
    <section className="san-insights" aria-labelledby="san-insights-title">
      <div className="san-insights-head">
        <h2 id="san-insights-title" className="san-insights-title">Insights</h2>
        <p className="san-insights-sub">
          What is likely next for your shop, worked out from its own sales and views. Not tied to the dates above.
        </p>
      </div>
      {shown(forecast) && <ForecastKpis forecast={forecast} />}
      {shown(forecast) && <ForecastCard forecast={forecast} />}
      {shown(stock) && <StockCard stock={stock} />}
      <Pair>
        {shown(buyers) && <BuyersCard key="buyers" buyers={buyers} />}
        {shown(performance) && <PerformanceCard key="performance" performance={performance} />}
      </Pair>
      {bundles && <BundleIdeas data={bundles} />}
    </section>
  );
}
