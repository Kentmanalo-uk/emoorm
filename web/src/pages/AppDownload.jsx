import {
  useCallback, useEffect, useLayoutEffect, useRef, useState,
} from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  CaretDown, CaretLeft, CaretRight, CheckCircle, DownloadSimple, Export, PlusSquare, ShareNetwork, ShieldCheck, X,
} from '@phosphor-icons/react';
import Layout from '../components/layout/Layout';
import { useShare } from '../components/ShareSheet';
import { usePhoneLayout } from '../hooks/useMobileNav';
import { useSheetPresence } from '../hooks/useSheetMotion';
import useSeo from '../lib/seo';
import { androidAppVersion } from '../lib/inApp';
import release from '../data/androidApp.json';
import './AppDownload.css';

/**
 * The E-MOORM Android app's download page (/app): E-MOORM's green and pink,
 * laid out plainly. The icon with the name and the one button that matters,
 * the app's screens, then a few titled lines on what it does, how to
 * install it and what's new. Once the hero has scrolled away, a bar at the
 * bottom keeps the app and its Get button at hand.
 *
 * What it says about the app comes from the APK itself (data/androidApp.json,
 * written by apk/publish.cjs).
 *
 * "Get the app" downloads the APK on Android phones and on computers (where
 * the sheet that follows offers a QR code to open this page on a phone); the
 * sheet walks through installing it. An iPhone can't install it, so there
 * the button explains adding E-MOORM to the Home Screen. Inside the app it
 * says Installed, or Update once a newer version is out.
 */

const ICON = '/icon-512x512.png';
const ICON_SMALL = '/icon-192x192.png';
const FILE_NAME = release.file.split('/').pop();
const SIZE_MB = (release.size / 1e6).toFixed(1);

const PREVIEWS = [
  { src: '/app-preview/preview-1.jpg', alt: 'The marketplace of Mindoreño is here: the E-MOORM home page' },
  { src: '/app-preview/preview-2.jpg', alt: 'Start your business journey: opening a shop on E-MOORM' },
  { src: '/app-preview/preview-3.jpg', alt: 'Manage your shop: the Seller Center' },
  { src: '/app-preview/preview-4.jpg', alt: 'Personalize and own it: shop templates' },
];

// About the app: the first lines show; the arrow opens the rest.
const ABOUT = [
  'Emoorm is Oriental Mindoro\'s own online marketplace. It brings you the farmers, fishers, artisans and food '
    + 'producers of every town, so fresh produce, local delicacies and handcrafted goods are only a few taps away.',
  'Browse by category or municipality, chat with sellers about products and orders, and follow each order from '
    + 'confirmed to completed, with delivery or pickup. Pay the way the seller accepts: cash on delivery, GCash '
    + 'or QR Ph.',
  'Selling? Open a free shop and run it from the Seller Center: your products, orders, messages and earnings, all '
    + 'in one place.',
  'The app picks up where you left off, opens emoorm.shop links straight away, and is always as up to date as the '
    + 'site itself.',
];

const FEATURES = [
  { title: 'Shop local', text: 'Fresh finds from every town in Oriental Mindoro.' },
  { title: 'Chat with sellers', text: 'Ask about a product or an order, right in the app.' },
  { title: 'Follow your orders', text: 'From confirmed to completed.' },
  { title: 'Sell with a free shop', text: 'Run it all from your phone.' },
];

const ANDROID_STEPS = ['Tap Get the app', 'Open the file', 'Tap Install'];
const IPHONE_STEPS = ['Tap Share in Safari', 'Add to Home Screen', 'Tap Add'];

/** A release note "Title: more words" as its title and the rest. */
const splitNote = (note) => {
  const at = note.indexOf(': ');
  if (at < 0) return { title: note.replace(/\.$/, ''), text: '' };
  const rest = note.slice(at + 2);
  return { title: note.slice(0, at), text: rest.charAt(0).toUpperCase() + rest.slice(1) };
};

/** Where the page is open: the app itself, an iPhone, an Android phone or a computer. */
const platformOf = () => {
  const version = androidAppVersion();
  if (version) return { kind: 'app', version };
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return { kind: 'ios' };
  if (/Android/i.test(ua)) return { kind: 'android' };
  return { kind: 'computer' };
};

/** Whether version a ("1.2.0") comes before b ("1.3.0"). */
const isOlder = (a, b) => {
  const x = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const y = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
  }
  return false;
};

function QrCode({ size }) {
  const icon = Math.round(size * 0.22);
  return (
    <QRCodeSVG
      value={`${window.location.origin}/app`}
      size={size}
      level="Q"
      marginSize={0}
      imageSettings={{
        src: ICON_SMALL, width: icon, height: icon, excavate: true,
      }}
      title="QR code for emoorm.shop/app"
    />
  );
}

function GetButton({
  platform, onGet, onIphone, compact = false, buttonRef = null,
}) {
  const className = `appdl-get${compact ? ' is-compact' : ''}`;
  if (platform.kind === 'ios') {
    return (
      <button ref={buttonRef} type="button" className={className} onClick={onIphone}>
        <DownloadSimple size={compact ? 17 : 20} weight="bold" aria-hidden="true" />
        {compact ? 'Get' : 'Get the app'}
      </button>
    );
  }
  if (platform.kind === 'app' && !isOlder(platform.version, release.version)) {
    return (
      <span ref={buttonRef} className={`${className} is-installed`}>
        <CheckCircle size={compact ? 17 : 20} weight="fill" aria-hidden="true" />
        Installed
      </span>
    );
  }
  const update = platform.kind === 'app';
  return (
    <a ref={buttonRef} className={className} href={release.file} download={FILE_NAME} onClick={onGet}>
      <DownloadSimple size={compact ? 17 : 20} weight="bold" aria-hidden="true" />
      {update && (compact ? 'Update' : `Update to ${release.version}`)}
      {!update && (compact ? 'Get' : 'Get the app')}
    </a>
  );
}

/** A bottom sheet on phones, a dialog on wider screens. */
function Sheet({
  open, onClose, title, children,
}) {
  const { mounted, closing } = useSheetPresence(open);
  const panel = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const before = document.activeElement;
    panel.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, [open, onClose]);

  if (!mounted) return null;
  return (
    <div
      className={`appdl-sheet-backdrop ui-sheet-backdrop${closing ? ' is-closing' : ''}`}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panel}
        className="appdl-sheet ui-sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="appdl-sheet-head">
          <img src={ICON_SMALL} alt="" className="appdl-sheet-icon" />
          <h2>{title}</h2>
          <button type="button" className="appdl-sheet-close" onClick={onClose} aria-label="Close">
            <X size={15} weight="bold" />
          </button>
        </div>
        {children}
        <button type="button" className="appdl-sheet-done" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

/** The screenshots full screen, one at a time (swipe, arrows or the keyboard). */
function PreviewViewer({ start, onClose }) {
  const track = useRef(null);
  const done = useRef(null);
  const [index, setIndex] = useState(start);

  useLayoutEffect(() => {
    const el = track.current;
    if (el) el.scrollLeft = start * el.clientWidth;
  }, [start]);

  const go = useCallback((step) => {
    const el = track.current;
    if (!el) return;
    const current = Math.round(el.scrollLeft / el.clientWidth);
    const next = Math.min(PREVIEWS.length - 1, Math.max(0, current + step));
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    done.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight') go(1);
      else if (event.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [go, onClose]);

  const onScroll = () => {
    const el = track.current;
    if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className="appdl-viewer" role="dialog" aria-modal="true" aria-label="Screenshots">
      <div className="appdl-viewer-bar">
        <span>{`${index + 1} of ${PREVIEWS.length}`}</span>
        <button ref={done} type="button" className="appdl-viewer-done" onClick={onClose}>Done</button>
      </div>
      <div className="appdl-viewer-track" ref={track} onScroll={onScroll}>
        {PREVIEWS.map((shot) => (
          <div className="appdl-viewer-slide" key={shot.src}>
            <img src={shot.src} alt={shot.alt} />
          </div>
        ))}
      </div>
      <button
        type="button"
        className="appdl-viewer-nav is-prev"
        onClick={() => go(-1)}
        disabled={index === 0}
        aria-label="Previous screenshot"
      >
        <CaretLeft size={22} weight="bold" />
      </button>
      <button
        type="button"
        className="appdl-viewer-nav is-next"
        onClick={() => go(1)}
        disabled={index === PREVIEWS.length - 1}
        aria-label="Next screenshot"
      >
        <CaretRight size={22} weight="bold" />
      </button>
    </div>
  );
}

/**
 * After Get, what the phone shows next, in its own words (Chrome's "File
 * downloaded — Open", then Android's "Permission required" for apps from
 * outside the Play Store the first time).
 */
function AfterGetSteps() {
  return (
    <ol className="appdl-sheet-steps">
      <li>If the browser asks, tap <strong>Download</strong>.</li>
      <li>
        When it has downloaded, tap <strong>Open</strong>, or open <strong>{FILE_NAME}</strong> from
        {' '}<strong>Downloads</strong>.
      </li>
      <li>
        If Android says it can&apos;t install unknown apps from this source, tap <strong>Settings</strong>, turn on
        {' '}<strong>Allow from this source</strong>, then go back.
      </li>
      <li>Tap <strong>Install</strong>, then <strong>Open</strong>.</li>
    </ol>
  );
}

export default function AppDownload() {
  const isPhone = usePhoneLayout();
  const [platform] = useState(platformOf);
  const [sheet, setSheet] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [pastHero, setPastHero] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutHeight, setAboutHeight] = useState(0);
  const heroGet = useRef(null);
  const end = useRef(null);
  const aboutText = useRef(null);
  const { share, shareSheet } = useShare();
  const ios = platform.kind === 'ios';
  const computer = platform.kind === 'computer';
  const installed = platform.kind === 'app' && !isOlder(platform.version, release.version);
  const steps = ios ? IPHONE_STEPS : ANDROID_STEPS;
  // Wide screens have the site footer below: the bar steps aside there.
  const docked = !installed && pastHero && (isPhone || !atEnd);

  useSeo({
    title: 'E-MOORM app for Android',
    description: `Get the E-MOORM app for Android: shop local from Oriental Mindoro in a ${SIZE_MB} MB app. `
      + `Free, for Android ${release.minAndroid} or newer.`,
    path: '/app',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'MobileApplication',
      name: 'E-MOORM',
      operatingSystem: `Android ${release.minAndroid} or newer`,
      applicationCategory: 'ShoppingApplication',
      softwareVersion: release.version,
      fileSize: `${SIZE_MB} MB`,
      datePublished: release.released,
      downloadUrl: `${window.location.origin}${release.file}`,
      screenshot: PREVIEWS.map((shot) => `${window.location.origin}${shot.src}`),
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'PHP' },
      publisher: { '@type': 'Organization', name: 'E-MOORM', url: window.location.origin },
    },
  });

  // Once the hero's button has scrolled away, a bar at the bottom keeps the
  // app and "Get" at hand. Read from the positions on each scroll (a jump
  // straight to the bottom passes the end without ever showing it).
  useEffect(() => {
    if (installed) return undefined;
    let frame = 0;
    const check = () => {
      frame = 0;
      const hero = heroGet.current;
      const last = end.current;
      if (!hero || !last) return;
      setPastHero(hero.getBoundingClientRect().bottom < 0);
      // At the end, or past it (the site footer below).
      setAtEnd(last.getBoundingClientRect().top < window.innerHeight);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [installed]);

  const closeSheet = useCallback(() => setSheet(null), []);
  const closeViewer = useCallback(() => setViewer(null), []);
  // The link itself downloads the file; this only shows what comes next.
  const onGet = () => setSheet('installing');
  const onIphone = () => setSheet('iphone');
  const onShare = () => share({
    title: 'E-MOORM app for Android',
    text: 'Get the E-MOORM app: shop local from Oriental Mindoro.',
    url: `${window.location.origin}/app`,
  });
  // Opening measures the whole text, so it can grow to it smoothly.
  const toggleAbout = () => {
    if (aboutText.current) setAboutHeight(aboutText.current.scrollHeight);
    setAboutOpen((open) => !open);
  };

  // Phones: Share sits at the right of the site's back bar.
  const barShare = (
    <button type="button" className="appdl-bar-share" onClick={onShare} aria-label="Share">
      <ShareNetwork size={22} weight="bold" />
    </button>
  );

  return (
    <Layout showFooter={!isPhone} phoneBarEnd={barShare}>
      <div className={`appdl-page${docked ? ' is-docked' : ''}`}>
        <section className="appdl-hero">
          <div className="appdl-wrap appdl-hero-inner">
            <img className="appdl-hero-icon" src={ICON} alt="Emoorm app icon" width="512" height="512" />
            <div className="appdl-hero-text">
              <h1 className="appdl-name">
                Emoorm <span className="appdl-beta" title="The app is still being tested: tell us if something doesn't work">Beta</span>
              </h1>
              <p className="appdl-tagline">The Mindoreño marketplace</p>
              <p className="appdl-beta-note">Early version: some things may still change. Found a problem? Tell us in Help &amp; Support.</p>
            </div>
            <div className="appdl-hero-actions">
              <GetButton platform={platform} onGet={onGet} onIphone={onIphone} buttonRef={heroGet} />
            </div>
            {!isPhone && (
              <button type="button" className="appdl-ghost appdl-hero-share" onClick={onShare}>
                <ShareNetwork size={17} weight="bold" aria-hidden="true" />
                Share
              </button>
            )}
          </div>
        </section>

        <section className="appdl-wrap appdl-about" aria-labelledby="appdl-about-title">
          <h2 id="appdl-about-title" className="appdl-h2">
            <button
              type="button"
              className="appdl-about-toggle"
              onClick={toggleAbout}
              aria-expanded={aboutOpen}
              aria-controls="appdl-about-text"
            >
              About the app
              <CaretDown size={20} weight="bold" className="appdl-about-arrow" aria-hidden="true" />
            </button>
          </h2>
          <div
            id="appdl-about-text"
            ref={aboutText}
            className={`appdl-about-text${aboutOpen ? ' is-open' : ''}`}
            style={aboutOpen && aboutHeight ? { maxHeight: `${aboutHeight}px` } : undefined}
            onClick={aboutOpen ? undefined : toggleAbout}
          >
            {ABOUT.map((paragraph) => <p key={paragraph.slice(0, 24)}>{paragraph}</p>)}
          </div>
        </section>

        <section className="appdl-gallery" aria-labelledby="appdl-preview-title">
          <h2 id="appdl-preview-title" className="appdl-wrap appdl-h2">Preview</h2>
          <div className="appdl-shots">
            {PREVIEWS.map((shot, i) => (
              <button
                type="button"
                key={shot.src}
                className="appdl-shot"
                onClick={() => setViewer(i)}
                aria-label={`Screenshot ${i + 1} of ${PREVIEWS.length}: ${shot.alt}`}
              >
                <img
                  src={shot.src}
                  alt=""
                  width="1080"
                  height="1920"
                  loading={i < 2 ? 'eager' : 'lazy'}
                  decoding="async"
                />
              </button>
            ))}
          </div>
        </section>

        <section className="appdl-wrap appdl-section" aria-labelledby="appdl-features-title">
          <h2 id="appdl-features-title" className="appdl-h2">Made for Oriental Mindoro</h2>
          <ul className="appdl-list">
            {FEATURES.map(({ title, text }) => (
              <li key={title}>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ul>
        </section>

        {!installed && (
          <section className="appdl-wrap appdl-section" aria-labelledby="appdl-steps-title">
            <h2 id="appdl-steps-title" className="appdl-h2">
              {ios ? 'On iPhone, in three steps' : 'Install in three steps'}
            </h2>
            <ol className="appdl-list appdl-steps">
              {steps.map((label, i) => (
                <li key={label}>
                  <span className="appdl-step-number">{`Step ${i + 1}`}</span>
                  <h3>{label}</h3>
                </li>
              ))}
            </ol>
            <p className="appdl-section-note">
              {ios
                ? 'E-MOORM then opens full screen from your Home Screen.'
                : 'The first time, Android may ask you to allow installs from your browser.'}
            </p>
          </section>
        )}

        <section className="appdl-wrap appdl-section" aria-labelledby="appdl-news-title">
          <h2 id="appdl-news-title" className="appdl-h2">{`New in ${release.version}`}</h2>
          <ul className="appdl-list appdl-news">
            {release.notes.map((note) => {
              const { title, text } = splitNote(note);
              return (
                <li key={note}>
                  <h3>{title}</h3>
                  {text && <p>{text}</p>}
                </li>
              );
            })}
          </ul>
        </section>

        <nav className="appdl-wrap appdl-end" aria-label="Privacy" ref={end}>
          <Link to="/privacy">Privacy Policy</Link>
        </nav>

        {docked && (
          <div className="appdl-dock">
            <div className="appdl-wrap appdl-dock-inner">
              <img src={ICON_SMALL} alt="" />
              <span className="appdl-dock-text">
                <strong>Emoorm</strong>
                <small>{`${SIZE_MB} MB`}</small>
              </span>
              <GetButton platform={platform} onGet={onGet} onIphone={onIphone} compact />
            </div>
          </div>
        )}

        <Sheet open={sheet === 'installing'} onClose={closeSheet} title="Downloading E-MOORM">
          {computer ? (
            <div className="appdl-sheet-body">
              <p>
                It&apos;s an Android app: copy <strong>{FILE_NAME}</strong> to your Android phone and open it there.
                Easier: scan this with the phone&apos;s camera and tap <strong>Get the app</strong> on the phone.
              </p>
              <div className="appdl-sheet-qr">
                <QrCode size={148} />
              </div>
            </div>
          ) : (
            <div className="appdl-sheet-body">
              <AfterGetSteps />
              <p className="appdl-sheet-note">
                <ShieldCheck size={18} weight="fill" aria-hidden="true" />
                It comes from emoorm.shop, not the Play Store, so Google Play Protect may offer to check it first.
              </p>
            </div>
          )}
        </Sheet>

        <Sheet open={sheet === 'iphone'} onClose={closeSheet} title="E-MOORM on iPhone">
          <div className="appdl-sheet-body">
            <p>
              The E-MOORM app is for Android phones. On iPhone, add E-MOORM to your Home Screen: it opens full
              screen, like an app.
            </p>
            <ol className="appdl-sheet-steps">
              <li>
                In Safari, tap <Export size={17} weight="bold" aria-hidden="true" className="appdl-inline-icon" />
                {' '}<strong>Share</strong>.
              </li>
              <li>
                Tap <PlusSquare size={17} weight="bold" aria-hidden="true" className="appdl-inline-icon" />
                {' '}<strong>Add to Home Screen</strong>.
              </li>
              <li>Tap <strong>Add</strong>.</li>
            </ol>
          </div>
        </Sheet>

        {viewer !== null && <PreviewViewer start={viewer} onClose={closeViewer} />}
        {shareSheet}
      </div>
    </Layout>
  );
}
