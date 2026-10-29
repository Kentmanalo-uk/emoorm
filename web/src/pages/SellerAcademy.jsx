import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, BookOpen, CaretRight, Check, CheckCircle, Clock, DeviceMobile, GraduationCap,
  Lightbulb, PlayCircle, X,
} from '../lib/icons';
import Layout from '../components/layout/Layout';
import PhoneFrame from '../components/ui/PhoneFrame';
import useSeo from '../lib/seo';
import useAuthStore from '../store/authStore';
import {
  LESSONS, STAGES, lessonNumber, readDone, totalMinutes, writeDone,
} from '../lib/sellerAcademy';
import './SellerAcademy.css';

/*
 * /sell/academy: the E-MOORM Seller Academy. Free, plain-English lessons on
 * selling on E-MOORM, grouped in four stages, with pictures. Open to
 * everyone, so people can learn before they apply. /sell/academy/:slug is
 * one lesson, with the list beside it on computers and Back / Next below.
 * Finished lessons are kept on this device.
 */
export default function SellerAcademy() {
  const { slug } = useParams();
  const [done, setDone] = useState(readDone);
  const user = useAuthStore((s) => s.user);
  const isSeller = user?.role === 'SELLER';

  const toggleDone = useCallback((key, value) => {
    setDone((prev) => {
      const next = value ? [...new Set([...prev, key])] : prev.filter((s) => s !== key);
      writeDone(next);
      return next;
    });
  }, []);

  if (slug) {
    const lesson = LESSONS.find((l) => l.slug === slug);
    if (!lesson) return <Navigate to="/sell/academy" replace />;
    return <LessonPage key={lesson.slug} lesson={lesson} done={done} onDone={toggleDone} isSeller={isSeller} />;
  }
  return <Overview done={done} isSeller={isSeller} />;
}

/* ── The overview ─────────────────────────────────────────────── */

function Overview({ done, isSeller }) {
  useSeo({
    title: 'Seller Academy',
    description: 'Free, simple lessons on how to sell on E-MOORM: open a shop, list products, handle orders, get paid and grow.',
    path: '/sell/academy',
  });
  const next = LESSONS.find((l) => !done.includes(l.slug)) || LESSONS[0];
  const count = done.length;
  const started = count > 0;
  const finished = count === LESSONS.length;
  const NextIcon = next.Icon;

  return (
    <Layout phoneBackTo={isSeller ? '/seller' : '/sell'}>
      <div className="sa-page">
        <div className="sa-wrap">
          <header className="sa-head">
            <div>
              <h1>Seller Academy</h1>
              <p>Free, short lessons with pictures on how to sell well on E-MOORM.</p>
            </div>
            <ul className="sa-facts" aria-label="About the academy">
              <li><BookOpen size={16} weight="fill" /> {LESSONS.length} lessons</li>
              <li><Clock size={16} weight="fill" /> About {totalMinutes} min</li>
              <li><CheckCircle size={16} weight="fill" /> Free</li>
            </ul>
          </header>

          {/* Where to go next: the next lesson, with the app beside it */}
          <section className="sa-feature" aria-label={started ? 'Continue learning' : 'Start here'}>
            <div className="sa-feature-body">
              <span className="sa-eyebrow">
                {finished ? 'All lessons done' : started ? 'Continue where you left off' : 'Start here'}
              </span>
              <h2>
                <NextIcon size={26} weight="fill" className={`sa-tone is-${next.tone}`} />
                Lesson {lessonNumber(next.slug)}: {next.title}
              </h2>
              <p>{next.summary}</p>
              <Progress count={count} />
              <div className="sa-actions">
                <Link to={`/sell/academy/${next.slug}`} className="sa-btn sa-btn-primary">
                  {finished ? 'Read again' : started ? 'Continue' : 'Start lesson 1'}
                  <ArrowRight size={16} weight="bold" />
                </Link>
                <Link to="/sell/tutorial" className="sa-btn sa-btn-outline">
                  <PlayCircle size={18} weight="fill" /> Watch the 3-minute video
                </Link>
              </div>
            </div>
            <div className="sa-feature-art" aria-hidden="true">
              <PhoneFrame src="/tutorial/seller-home.webp" width={228} />
            </div>
          </section>

          {STAGES.map((stage, i) => {
            const lessons = LESSONS.filter((l) => l.stage === stage.key);
            const stageDone = lessons.filter((l) => done.includes(l.slug)).length;
            return (
              <section className="sa-stage" key={stage.key} aria-labelledby={`sa-stage-${stage.key}`}>
                <header className="sa-stage-head">
                  <span className="sa-stage-num">{i + 1}</span>
                  <div>
                    <h2 id={`sa-stage-${stage.key}`}>{stage.title}</h2>
                    <p>{stage.text}</p>
                  </div>
                  <span className="sa-stage-count">{stageDone}/{lessons.length} done</span>
                </header>
                <div className="sa-grid">
                  {lessons.map((l) => <LessonCard key={l.slug} lesson={l} done={done.includes(l.slug)} />)}
                </div>
              </section>
            );
          })}

          <section className="sa-panel sa-closing">
            <span className="sa-panel-icon"><GraduationCap size={22} weight="fill" /></span>
            <div>
              <h2>{isSeller ? 'Try one thing today' : 'Ready to open your shop?'}</h2>
              <p>
                {isSeller
                  ? 'Open your Seller Center and use one tip from the lessons.'
                  : 'It is free. Your town admin checks your shop, then buyers can order.'}
              </p>
            </div>
            <Link to={isSeller ? '/seller' : '/sell'} className="sa-btn sa-btn-primary">
              {isSeller ? 'Go to Seller Center' : 'Start selling'} <ArrowRight size={16} weight="bold" />
            </Link>
          </section>
        </div>
      </div>
    </Layout>
  );
}

function Progress({ count }) {
  const pct = Math.round((count / LESSONS.length) * 100);
  return (
    <div className="sa-progress" aria-label={`${count} of ${LESSONS.length} lessons done`}>
      <div className="sa-progress-bar"><span style={{ width: `${pct}%` }} /></div>
      <span>{count} of {LESSONS.length} done</span>
    </div>
  );
}

function LessonCard({ lesson, done }) {
  const { Icon } = lesson;
  return (
    <Link to={`/sell/academy/${lesson.slug}`} className={`sa-card${done ? ' is-done' : ''}`}>
      <span className="sa-card-top">
        <Icon size={30} weight="fill" className={`sa-tone is-${lesson.tone}`} />
        {done
          ? <span className="sa-card-done"><CheckCircle size={18} weight="fill" /> Done</span>
          : <span className="sa-card-num">{lessonNumber(lesson.slug)}</span>}
      </span>
      <strong className="sa-card-title">{lesson.title}</strong>
      <span className="sa-card-text">{lesson.summary}</span>
      <span className="sa-card-foot">
        <span><Clock size={14} /> {lesson.minutes} min</span>
        <ArrowRight size={15} weight="bold" className="sa-card-go" />
      </span>
    </Link>
  );
}

/* ── One lesson ───────────────────────────────────────────────── */

function LessonPage({ lesson, done, onDone, isSeller }) {
  useSeo({ title: `${lesson.title} · Seller Academy`, description: lesson.summary, path: `/sell/academy/${lesson.slug}` });
  const index = LESSONS.indexOf(lesson);
  const prev = LESSONS[index - 1];
  const next = LESSONS[index + 1];
  const stage = STAGES.find((s) => s.key === lesson.stage);
  const isDone = done.includes(lesson.slug);
  const { Icon } = lesson;

  // A step with its own screen shows it in the phone when tapped; the
  // lesson's screen shows until then.
  const [active, setActive] = useState(null);
  const inlineRef = useRef(null);
  const screen = (active != null && lesson.steps[active]?.screen) || lesson.screen;
  const showStep = (i) => {
    setActive(i);
    // Phones: the phone sits above the steps, so bring it into view.
    const el = inlineRef.current;
    if (el && getComputedStyle(el).display !== 'none') {
      const box = el.getBoundingClientRect();
      if (box.top < 60 || box.bottom > window.innerHeight) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // A new lesson opens at the top.
  useEffect(() => { window.scrollTo(0, 0); }, [lesson.slug]);

  // Lessons to try in the Seller Center send others to the Sell page first.
  const action = useMemo(() => {
    if (!lesson.action) return null;
    if (lesson.action.seller && !isSeller) return { label: 'Open a free shop first', to: '/sell' };
    if (lesson.action.seller === false && isSeller) return { label: 'Go to Seller Center', to: '/seller' };
    return lesson.action;
  }, [lesson, isSeller]);

  return (
    <Layout phoneBackTo="/sell/academy">
      <div className="sa-page">
        <div className="sa-wrap sa-lesson-grid">
          <aside className="sa-side" aria-label="All lessons">
            <Link to="/sell/academy" className="sa-side-home">
              <GraduationCap size={18} weight="fill" /> Seller Academy
            </Link>
            <Progress count={done.length} />
            {STAGES.map((s) => (
              <div className="sa-side-stage" key={s.key}>
                <span className="sa-side-stage-title">{s.title}</span>
                {LESSONS.filter((l) => l.stage === s.key).map((l) => (
                  <Link
                    key={l.slug}
                    to={`/sell/academy/${l.slug}`}
                    className={`sa-side-link${l.slug === lesson.slug ? ' is-current' : ''}`}
                    aria-current={l.slug === lesson.slug ? 'page' : undefined}
                  >
                    <span className={`sa-side-mark${done.includes(l.slug) ? ' is-done' : ''}`}>
                      {done.includes(l.slug) ? <Check size={11} weight="bold" /> : lessonNumber(l.slug)}
                    </span>
                    {l.title}
                  </Link>
                ))}
              </div>
            ))}
          </aside>

          <article className="sa-lesson" key={lesson.slug}>
            <nav className="sa-crumbs" aria-label="Breadcrumb">
              <Link to="/sell/academy">Seller Academy</Link>
              <CaretRight size={12} />
              <span>{stage?.title}</span>
            </nav>

            <header className="sa-lesson-head">
              <Icon size={34} weight="fill" className={`sa-tone is-${lesson.tone}`} />
              <div>
                <span className="sa-lesson-meta">
                  Lesson {index + 1} of {LESSONS.length} <i aria-hidden="true">·</i> <Clock size={13} /> {lesson.minutes} min
                </span>
                <h1>{lesson.title}</h1>
                <p>{lesson.summary}</p>
              </div>
            </header>

            {screen && (
              <figure className="sa-screen is-inline" ref={inlineRef}>
                <PhoneFrame src={screen.src} alt={screen.caption} width={230} />
                <figcaption>{screen.caption}</figcaption>
              </figure>
            )}

            <Visual visual={lesson.visual} />

            <section className="sa-block" aria-labelledby="sa-steps">
              <h2 id="sa-steps">Step by step</h2>
              <ol className="sa-steps">
                {lesson.steps.map((s, i) => {
                  const body = (
                    <>
                      <span className="sa-step-num">{i + 1}</span>
                      <div>
                        <strong>{s.title}</strong>
                        <p>{s.text}</p>
                      </div>
                      {s.screen && (
                        <span className="sa-step-see" aria-hidden="true">
                          <DeviceMobile size={16} weight={active === i ? 'fill' : 'regular'} />
                          <span>{active === i ? 'Showing' : 'See it'}</span>
                        </span>
                      )}
                    </>
                  );
                  return (
                    <li key={s.title} className={s.screen ? 'has-screen' : undefined}>
                      {s.screen ? (
                        <button
                          type="button"
                          className={`sa-step${active === i ? ' is-active' : ''}`}
                          onClick={() => showStep(i)}
                          aria-pressed={active === i}
                          title="Show this step in the phone"
                        >
                          {body}
                        </button>
                      ) : <div className="sa-step">{body}</div>}
                    </li>
                  );
                })}
              </ol>
            </section>

            {lesson.tips?.length > 0 && (
              <section className="sa-note is-tip" aria-label="Tip">
                <Lightbulb size={20} weight="fill" />
                <div>
                  <strong>Tip</strong>
                  {lesson.tips.map((t) => <p key={t}>{t}</p>)}
                </div>
              </section>
            )}

            {(lesson.dos?.length > 0 || lesson.donts?.length > 0) && (
              <section className="sa-dodont" aria-label="Do and don't">
                {lesson.dos?.length > 0 && (
                  <div className="sa-list is-do">
                    <strong><CheckCircle size={18} weight="fill" /> Do</strong>
                    <ul>{lesson.dos.map((d) => <li key={d}><Check size={14} weight="bold" /> {d}</li>)}</ul>
                  </div>
                )}
                {lesson.donts?.length > 0 && (
                  <div className="sa-list is-dont">
                    <strong><X size={18} weight="bold" /> Don&apos;t</strong>
                    <ul>{lesson.donts.map((d) => <li key={d}><X size={14} weight="bold" /> {d}</li>)}</ul>
                  </div>
                )}
              </section>
            )}

            <div className="sa-actions sa-lesson-actions">
              {action && (
                <Link to={action.to} className="sa-btn sa-btn-primary">
                  {action.label} <ArrowRight size={16} weight="bold" />
                </Link>
              )}
              <button
                type="button"
                className={`sa-btn ${isDone ? 'sa-btn-done' : 'sa-btn-outline'}`}
                onClick={() => onDone(lesson.slug, !isDone)}
                aria-pressed={isDone}
              >
                <CheckCircle size={18} weight={isDone ? 'fill' : 'regular'} />
                {isDone ? 'Done' : 'Mark as done'}
              </button>
            </div>

            <nav className="sa-pager" aria-label="Other lessons">
              {prev ? (
                <Link to={`/sell/academy/${prev.slug}`} className="sa-pager-link">
                  <ArrowLeft size={16} weight="bold" />
                  <span><small>Back</small>{prev.title}</span>
                </Link>
              ) : <span />}
              {next ? (
                <Link
                  to={`/sell/academy/${next.slug}`}
                  className="sa-pager-link is-next"
                  onClick={() => !isDone && onDone(lesson.slug, true)}
                >
                  <span><small>Next lesson</small>{next.title}</span>
                  <ArrowRight size={16} weight="bold" />
                </Link>
              ) : (
                <Link to="/sell/academy" className="sa-pager-link is-next" onClick={() => onDone(lesson.slug, true)}>
                  <span><small>All done</small>Back to the Academy</span>
                  <GraduationCap size={18} weight="fill" />
                </Link>
              )}
            </nav>
          </article>

          {screen && (
            <aside className="sa-screen is-rail" aria-label="In the app">
              <span className="sa-screen-label">In the app</span>
              <PhoneFrame src={screen.src} alt={screen.caption} width={272} loading="eager" />
              <span className="sa-screen-caption" aria-live="polite">{screen.caption}</span>
            </aside>
          )}
        </div>
      </div>
    </Layout>
  );
}

/* ── Pictures ─────────────────────────────────────────────────── */

function Visual({ visual }) {
  if (!visual) return null;
  if (visual.kind === 'photos') {
    return (
      <figure className="sa-visual">
        <div className="sa-photos">
          {visual.items.map((p) => (
            <span className="sa-photo" key={p.src}>
              <img src={p.src} alt={p.label} loading="lazy" />
              <span><Check size={13} weight="bold" /> {p.label}</span>
            </span>
          ))}
        </div>
        <figcaption>Good product photos from E-MOORM sellers</figcaption>
      </figure>
    );
  }
  if (visual.kind === 'flow') {
    return (
      <figure className="sa-visual">
        <ol className="sa-flow">
          {visual.items.map(({ Icon, label }, i) => (
            <li key={label}>
              <span className="sa-flow-icon"><Icon size={24} weight="fill" /></span>
              <span className="sa-flow-label">{label}</span>
              {i < visual.items.length - 1 && <CaretRight size={16} weight="bold" className="sa-flow-arrow" aria-hidden="true" />}
            </li>
          ))}
        </ol>
      </figure>
    );
  }
  return (
    <figure className="sa-visual">
      <div className="sa-cards">
        {visual.items.map(({ Icon, title, text }) => (
          <div className="sa-mini" key={title}>
            <span className="sa-mini-icon"><Icon size={20} weight="fill" /></span>
            <strong>{title}</strong>
            <span>{text}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
