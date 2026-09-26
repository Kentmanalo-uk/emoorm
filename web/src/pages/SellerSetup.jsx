import { useEffect } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  Check, CaretRight, Clock, Warning, ArrowRight, Confetti, Storefront,
} from '@phosphor-icons/react';
import Skeleton from '../components/ui/Skeleton';
import { completeGuide, shouldShowGuide } from '../lib/sellerGuides';
import { describeStep, nextStep } from '../lib/sellerSetup';
import './SellerDashboard.css';

/*
 * Shop setup: the first thing a new seller sees after applying. One list of
 * what is done (ticked) and what is left, in the order that gets a shop ready
 * for buyers, with the single next step lifted to the top so there is always
 * one obvious thing to tap. Each step opens the exact card on the page where
 * it is done, with a "Back to shop setup" link waiting there.
 */

const FROM_SETUP = { fromSetup: true };

function StepRow({ step, meta }) {
  const Icon = meta.icon;
  const mark = meta.tone === 'done'
    ? <Check size={16} weight="bold" />
    : meta.tone === 'failed'
      ? <Warning size={16} weight="fill" />
      : meta.tone === 'waiting'
        ? <Clock size={16} weight="bold" />
        : <Icon size={17} />;

  const body = (
    <>
      <span className="ss-step-mark" aria-hidden="true">{mark}</span>
      <span className="ss-step-body">
        <strong>
          {meta.title}
          {meta.optional && meta.tone !== 'done' && <em className="ss-tag">Optional</em>}
        </strong>
        <span>{meta.text}</span>
      </span>
      <span className="ss-step-state">
        {meta.tone === 'done' && <span className="ss-done-word">Done</span>}
        {meta.to && meta.tone !== 'done' && meta.tone !== 'waiting' && (
          <span className="ss-step-go">{meta.action}</span>
        )}
        {meta.to && <CaretRight size={16} className="ss-step-caret" />}
      </span>
    </>
  );

  return (
    <li className={`ss-step is-${meta.tone}`} data-step={step.key}>
      {meta.to ? (
        <Link to={meta.to} state={FROM_SETUP} className="ss-step-link">{body}</Link>
      ) : (
        <div className="ss-step-link is-static">{body}</div>
      )}
    </li>
  );
}

export default function SellerSetup() {
  const { store, setStore, setup, refreshSetup } = useOutletContext() || {};

  // Always fresh when opened: the seller has usually just saved something.
  useEffect(() => {
    refreshSetup?.();
  }, [refreshSetup]);

  // Seen once: the dashboard stops sending first-time sellers here.
  useEffect(() => {
    if (store?.id && shouldShowGuide(store, 'setup-intro')) completeGuide('setup-intro', setStore);
  }, [store, setStore]);

  if (!setup) {
    return (
      <div className="seller-dashboard">
        <div className="seller-container ss" aria-busy="true">
          <Skeleton height={120} radius={16} />
          <Skeleton height={96} radius={16} />
          <Skeleton height={320} radius={16} />
        </div>
      </div>
    );
  }

  const context = { municipality: setup.municipality };
  const described = setup.steps.map((step) => ({ step, meta: describeStep(step, context) }));
  const ready = described.filter(({ meta }) => meta.group === 'ready');
  const live = described.filter(({ meta }) => meta.group === 'live');
  const next = nextStep(setup);
  const nextMeta = next ? describeStep(next, context) : null;
  const NextIcon = nextMeta?.icon;
  const percent = Math.round((setup.doneCount / Math.max(1, setup.total)) * 100);
  const approval = setup.steps.find((s) => s.key === 'approval');
  const shopName = store?.name || 'your shop';

  return (
    <div className="seller-dashboard">
      <div className="seller-container ss">
        <header className="ss-hero">
          <div className="ss-hero-text">
            <span className="ss-kicker"><Storefront size={15} weight="fill" /> {shopName}</span>
            <h1>{setup.complete ? 'Your shop is ready' : 'Set up your shop'}</h1>
            <p>
              {setup.complete
                ? 'Everything is set and your shop is public. Buyers can find and order from it now.'
                : 'A few quick steps and your shop is ready for buyers. Tap a step to do it.'}
            </p>
          </div>
          <div className="ss-progress">
            <div className="ss-progress-top">
              <strong>{setup.doneCount} of {setup.total} done</strong>
              <span>{percent}%</span>
            </div>
            <div
              className="ss-progress-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={setup.total}
              aria-valuenow={setup.doneCount}
              aria-label="Shop setup progress"
            >
              <span style={{ width: `${percent}%` }} />
            </div>
          </div>
        </header>

        {setup.complete ? (
          <section className="ss-next ss-next--done">
            <span className="ss-next-icon"><Confetti size={26} weight="fill" /></span>
            <div className="ss-next-body">
              <span className="ss-next-label">All done</span>
              <h2>Your shop is live</h2>
              <p>Keep your products and stock up to date, and answer buyers quickly.</p>
            </div>
            <div className="ss-next-actions">
              <Link to="/seller" className="ss-next-btn">Go to dashboard <ArrowRight size={17} weight="bold" /></Link>
              {store?.slug && (
                <a href={`/store/${store.slug}`} target="_blank" rel="noreferrer" className="ss-next-btn ss-next-btn--ghost">
                  View your shop
                </a>
              )}
            </div>
          </section>
        ) : next ? (
          <section className="ss-next" aria-label="Next step">
            <span className="ss-next-icon"><NextIcon size={26} weight="fill" /></span>
            <div className="ss-next-body">
              <span className="ss-next-label">Next step</span>
              <h2>{nextMeta.title}</h2>
              <p>{nextMeta.text}</p>
            </div>
            <div className="ss-next-actions">
              <Link to={nextMeta.to} state={FROM_SETUP} className="ss-next-btn">
                {nextMeta.action} <ArrowRight size={17} weight="bold" />
              </Link>
            </div>
          </section>
        ) : (
          <section className="ss-next ss-next--waiting">
            <span className="ss-next-icon"><Clock size={26} weight="fill" /></span>
            <div className="ss-next-body">
              <span className="ss-next-label">You're all set</span>
              <h2>{approval?.applicationStatus === 'REJECTED' ? 'Your application needs attention' : 'Waiting for approval'}</h2>
              <p>{describeStep(approval || { key: 'approval' }, context).text}</p>
            </div>
          </section>
        )}

        <section className="ss-group" aria-labelledby="ss-ready">
          <h2 id="ss-ready" className="ss-group-title">Get your shop ready</h2>
          <ol className="ss-list">
            {ready.map(({ step, meta }) => <StepRow key={step.key} step={step} meta={meta} />)}
          </ol>
        </section>

        <section className="ss-group" aria-labelledby="ss-live">
          <h2 id="ss-live" className="ss-group-title">Go live</h2>
          <ol className="ss-list">
            {live.map(({ step, meta }) => <StepRow key={step.key} step={step} meta={meta} />)}
          </ol>
        </section>

        {!setup.complete && (
          <div className="ss-footer">
            <Link to="/seller" className="ss-skip">I'll finish later, go to my dashboard</Link>
            <span>You can come back any time from <strong>Shop setup</strong> in the menu.</span>
          </div>
        )}
      </div>
    </div>
  );
}
