import React from 'react';
import './Skeleton.css';

/**
 * Reusable skeleton primitives + page-shaped templates.
 * Usage:
 *   <Skeleton width={120} height={16} />
 *   <Skeleton.Text lines={3} />
 *   <Skeleton.Table cols={5} rows={6} />
 *   <Skeleton.Cards count={8} />
 *   <Skeleton.List rows={4} />
 *   <Skeleton.Stats count={4} />
 *   <Skeleton.OrderList rows={5} />
 */
function Skeleton({
  width,
  height = 12,
  radius = 6,
  circle = false,
  className = '',
  style = {},
  as: Tag = 'span',
}) {
  const finalStyle = {
    width: width ?? '100%',
    height: circle ? width || height : height,
    borderRadius: circle ? '50%' : radius,
    ...style,
  };
  return <Tag className={`sk ${className}`} style={finalStyle} aria-hidden="true" />;
}

/* ── Text lines ────────────────────────────────────────── */

function Text({ lines = 1, lastWidth = '68%', gap = 8, height = 12 }) {
  return (
    <span className="sk-text" style={{ gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={height}
          width={i === lines - 1 && lines > 1 ? lastWidth : '100%'}
        />
      ))}
    </span>
  );
}

/* ── Stat card row (dashboards) ───────────────────────── */

function Stats({ count = 4 }) {
  return (
    <div className="sk-stats">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="sk-stat-card">
          <Skeleton width={36} height={36} circle />
          <Skeleton width="55%" height={11} />
          <Skeleton width="40%" height={22} radius={4} />
          <Skeleton width="30%" height={10} />
        </div>
      ))}
    </div>
  );
}

/* ── Data table ───────────────────────────────────────── */

function Table({ cols = 5, rows = 6, showHeader = true }) {
  return (
    <div className="sk-table" role="presentation">
      {showHeader && (
        <div className="sk-table-row sk-table-head">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} height={10} width="55%" />
          ))}
        </div>
      )}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="sk-table-row">
          {Array.from({ length: cols }).map((_, c) => {
            if (c === 0) {
              return (
                <div key={c} className="sk-table-cell-user">
                  <Skeleton width={32} height={32} circle />
                  <span>
                    <Skeleton width={110} height={11} />
                    <Skeleton width={70} height={9} />
                  </span>
                </div>
              );
            }
            const isLast = c === cols - 1;
            return (
              <Skeleton
                key={c}
                height={isLast ? 26 : 12}
                width={isLast ? 80 : ['90%', '70%', '55%', '80%'][c % 4]}
                radius={isLast ? 6 : 4}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ── Product / store card grid ────────────────────────── */

function Cards({ count = 8 }) {
  return (
    <div className="sk-cards">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="sk-card">
          <Skeleton className="sk-card-media" height={168} radius={10} />
          <div className="sk-card-body">
            <Skeleton height={13} width="90%" />
            <Skeleton height={11} width="60%" />
            <div className="sk-card-foot">
              <Skeleton height={14} width={70} />
              <Skeleton height={22} width={22} circle />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Vertical list (orders, notifications, reviews) ───── */

function List({ rows = 4, avatar = true }) {
  return (
    <ul className="sk-list">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="sk-list-row">
          {avatar && <Skeleton width={40} height={40} circle />}
          <div className="sk-list-lines">
            <Skeleton height={12} width="45%" />
            <Skeleton height={10} width="80%" />
            <Skeleton height={10} width="55%" />
          </div>
          <div className="sk-list-side">
            <Skeleton height={12} width={60} />
            <Skeleton height={20} width={68} radius={999} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ── Order list (seller dashboard) ────────────────────── */

function OrderList({ rows = 4 }) {
  return (
    <ul className="sk-order-list">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="sk-order-row">
          <Skeleton width={38} height={38} radius={8} />
          <div className="sk-order-lines">
            <Skeleton height={11} width={130} />
            <Skeleton height={10} width={90} />
          </div>
          <div className="sk-order-right">
            <Skeleton height={12} width={70} />
            <Skeleton height={18} width={78} radius={999} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ── Full page containers ─────────────────────────────── */

function Page({ children }) {
  return <div className="sk-page">{children}</div>;
}

Skeleton.Text = Text;
Skeleton.Stats = Stats;
Skeleton.Table = Table;
Skeleton.Cards = Cards;
Skeleton.List = List;
Skeleton.OrderList = OrderList;
Skeleton.Page = Page;

export default Skeleton;
