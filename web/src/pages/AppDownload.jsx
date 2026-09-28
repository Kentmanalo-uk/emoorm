import {
  useCallback, useEffect, useLayoutEffect, useRef, useState,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  AndroidLogo, CaretLeft, CaretRight, Check, Export, PlusSquare, ShieldCheck,
  ShoppingBagOpen, UserSquare, X,
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
 * The E-MOORM Android app's download page (/app), laid out like an app's page
 * in Apple's App Store: the icon, name and Get button, a strip of facts,
 * What's New, the preview screenshots, the description, how to install, and
 * the details.
 *
 * What it says about the app comes from the APK itself (data/androidApp.json,
 * written by apk/publish.cjs); there are no ratings or rankings, as there are
 * none to show.
 *
 * Get downloads the APK on Android phones and on computers (which also get a
 * QR code to open this page on a phone). An iPhone can't install it, so there
 * Get explains adding E-MOORM to the Home Screen instead. Inside the app the
 * button says Installed, or Update once a newer version is out.
 */

const ICON = '/icon-512x512-maskable.png';
const ICON_SMALL = '/icon-192x192-maskable.png';
const FILE_NAME = release.file.split('/').pop();
const SIZE_MB = (release.size / 1e6).toFixed(1);
const LANGUAGES = ['English', 'Tagalog', 'Bisaya'];

const PREVIEWS = [
  { src: '/app-preview/preview-1.jpg', alt: 'The marketplace of Mindoreño is here: the E-MOORM home page' },
  { src: '/app-preview/preview-2.jpg', alt: 'Start your business journey: opening a shop on E-MOORM' },
  { src: '/app-preview/preview-3.jpg', alt: 'Manage your shop: the Seller Center' },
  { src: '/app-preview/preview-4.jpg', alt: 'Personalize and own it: shop templates' },
];

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

const releasedOn = (() => {
  const [y, m, d] = release.released.split('-').map(Number);
  return new Date(y, m - 1, d);
})();
const releasedLabel = releasedOn.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** "Today", "3d ago", "2w ago"… as the App Store puts it. */
const sinceRelease = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today - releasedOn) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
};

const getNote = (platform) => {
  if (platform.kind === 'app') {
    return isOlder(platform.version, release.version)
      ? `You have ${platform.version} · new: ${release.version}`
      : 'You have the latest version';
  }
  if (platform.kind === 'ios') return 'For Android phones';
  if (platform.kind === 'computer') return `Android app · ${SIZE_MB} MB`;
  return `Free · ${SIZE_MB} MB`;
};

function GetButton({
  platform, onGet, onIphone, compact = false, buttonRef = null,
}) {
  const className = `appdl-get${compact ? ' is-compact' : ''}`;
  if (platform.kind === 'ios') {
    return <button ref={buttonRef} type="button" className={className} onClick={onIphone}>Get</button>;
  }
  if (platform.kind === 'app' && !isOlder(platform.version, release.version)) {
    return (
      <span ref={buttonRef} className={`${className} is-installed`}>
        <Check size={compact ? 12 : 14} weight="bold" aria-hidden="true" />
        Installed
      </span>
    );
  }
  return (
    <a ref={buttonRef} className={className} href={release.file} download={FILE_NAME} onClick={onGet}>
      {platform.kind === 'app' ? 'Update' : 'Get'}
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
          <h2>{title}</h2>
          <button type="button" className="appdl-sheet-close" onClick={onClose} aria-label="Close">
            <X size={15} weight="bold" />
          </button>
        </div>
        {children}
        <button type="button" className="appdl-sheet-done" onClick={onClose}>Done</button>
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
    <>
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
    </>
  );
}

function AndroidSteps({ computer }) {
  return (
    <>
      <ol className="appdl-steps">
        {computer && (
          <li>
            On your Android phone, scan the QR code above with the camera, or open <strong>emoorm.shop/app</strong>.
          </li>
        )}
        <li>Tap <strong>Get</strong>.</li>
        <AfterGetSteps />
      </ol>
      <p className="appdl-install-note">
        <ShieldCheck size={20} weight="fill" aria-hidden="true" />
        <span>
          It comes from emoorm.shop, not the Play Store, so Google Play Protect may offer to check it first.
          New version later? Install it over this one: you stay signed in.
        </span>
      </p>
    </>
  );
}

function IphoneSteps() {
  return (
    <>
      <p className="appdl-install-lead">
        The E-MOORM app is for Android phones. On iPhone, add E-MOORM to your Home Screen: it opens full screen,
        like an app.
      </p>
      <ol className="appdl-steps">
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
    </>
  );
}

export default function AppDownload() {
  const isPhone = usePhoneLayout();
  const navigate = useNavigate();
  const [platform] = useState(platformOf);
  const [sheet, setSheet] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [moreText, setMoreText] = useState(false);
  const [compact, setCompact] = useState(false);
  const headGet = useRef(null);
  const { share, shareSheet } = useShare();
  const pageUrl = `${window.location.origin}/app`;

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

  // Phones: the page brings its own top bar (Back, Share), as the App Store
  // does; the site header and bottom navigation step aside meanwhile.
  useLayoutEffect(() => {
    if (!isPhone) return undefined;
    document.body.classList.add('appdl-phone-mode');
    return () => document.body.classList.remove('appdl-phone-mode');
  }, [isPhone]);

  // Once the big Get button has scrolled under the top bar, the bar shows
  // the icon and a small Get button.
  useEffect(() => {
    const target = headGet.current;
    if (!isPhone || !target || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      setCompact(!entry.isIntersecting && entry.boundingClientRect.top < 80);
    }, { rootMargin: '-56px 0px 0px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [isPhone]);

  const closeSheet = useCallback(() => setSheet(null), []);
  const closeViewer = useCallback(() => setViewer(null), []);
  // The link itself downloads the file; this only shows what comes next.
  const onGet = () => setSheet('installing');
  const onIphone = () => setSheet('iphone');
  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'));
  const onShare = () => share({
    title: 'E-MOORM app for Android',
    text: 'Get the E-MOORM app: shop local from Oriental Mindoro.',
    url: pageUrl,
  });

  const facts = [
    { label: 'Size', value: SIZE_MB, sub: 'MB' },
    { label: 'Requires', value: `${release.minAndroid}+`, sub: 'Android' },
    { label: 'Category', icon: ShoppingBagOpen, sub: 'Shopping' },
    { label: 'Developer', icon: UserSquare, sub: 'E-MOORM' },
    { label: 'Language', value: 'EN', sub: `+ ${LANGUAGES.length - 1} More` },
    { label: 'Version', value: release.version, sub: sinceRelease() },
  ];
  const showQr = !isPhone && platform.kind !== 'app';

  return (
    <Layout phoneBar={false} showFooter={!isPhone}>
      <div className="appdl-page">
        {isPhone && (
          <div className={`appdl-bar${compact ? ' is-compact' : ''}`}>
            <button type="button" className="appdl-round" onClick={goBack} aria-label="Back">
              <CaretLeft size={20} weight="bold" />
            </button>
            <div className="appdl-bar-mid" aria-hidden="true">
              <img src={ICON_SMALL} alt="" width="192" height="192" />
            </div>
            <div className="appdl-bar-end">
              {compact && <GetButton platform={platform} onGet={onGet} onIphone={onIphone} compact />}
              <button type="button" className="appdl-round" onClick={onShare} aria-label="Share">
                <Export size={19} weight="bold" />
              </button>
            </div>
          </div>
        )}

        <div className="appdl">
          <header className="appdl-head">
            <img className="appdl-icon" src={ICON} alt="E-MOORM app icon" width="512" height="512" />
            <div className="appdl-titles">
              <h1>E-MOORM</h1>
              <p className="appdl-subtitle">Shop local from Oriental Mindoro</p>
              <div className="appdl-get-row">
                <GetButton platform={platform} onGet={onGet} onIphone={onIphone} buttonRef={headGet} />
                <span className="appdl-get-note">{getNote(platform)}</span>
                {!isPhone && (
                  <button type="button" className="appdl-share" onClick={onShare}>
                    <Export size={17} weight="bold" aria-hidden="true" />
                    Share
                  </button>
                )}
              </div>
            </div>
            {showQr && (
              <aside className="appdl-qr" aria-label="Get it on your phone">
                <QRCodeSVG
                  value={pageUrl}
                  size={128}
                  level="Q"
                  marginSize={0}
                  imageSettings={{
                    src: ICON_SMALL, width: 30, height: 30, excavate: true,
                  }}
                  title="QR code for emoorm.shop/app"
                />
                <p>
                  <strong>Get it on your phone</strong>
                  <span>Scan with your Android phone&apos;s camera, then tap Get.</span>
                </p>
              </aside>
            )}
          </header>

          <ul className="appdl-facts" aria-label="About this app">
            {facts.map(({
              label, value, icon: Icon, sub,
            }) => (
              <li className="appdl-fact" key={label}>
                <span className="appdl-fact-label">{label}</span>
                <span className="appdl-fact-value">
                  {Icon ? <Icon size={26} weight="fill" aria-hidden="true" /> : value}
                </span>
                <span className="appdl-fact-sub">{sub}</span>
              </li>
            ))}
          </ul>

          <section className="appdl-section appdl-news" aria-labelledby="appdl-news-title">
            <h2 id="appdl-news-title">What&apos;s New</h2>
            <div className="appdl-version-row">
              <span>{`Version ${release.version}`}</span>
              <time dateTime={release.released} title={releasedLabel}>{sinceRelease()}</time>
            </div>
            <ul className="appdl-notes">
              {release.notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </section>

          <section className="appdl-section appdl-preview" aria-labelledby="appdl-preview-title">
            <h2 id="appdl-preview-title">Preview</h2>
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
            <p className="appdl-device">
              <AndroidLogo size={16} weight="fill" aria-hidden="true" />
              Android phones
            </p>
          </section>

          <section className="appdl-section appdl-about" aria-label="Description">
            <div className={`appdl-desc${moreText ? ' is-open' : ''}`}>
              <p>
                E-MOORM is Oriental Mindoro&apos;s own marketplace. Order fresh produce, local delicacies and
                handcrafted goods straight from farmers, fishers, artisans and food producers across the province,
                with delivery or pickup.
              </p>
              <p>
                Chat with shops about products and orders, follow your favourites, track every order and request a
                return if something isn&apos;t right. Pay the seller the way they accept: cash on delivery, GCash,
                QR Ph or bank transfer.
              </p>
              <p>
                Selling? Open a shop for free and run it from the Seller Center: products, orders, messages,
                earnings and your shop&apos;s look, all in one place.
              </p>
              {!moreText && (
                <button type="button" className="appdl-more" onClick={() => setMoreText(true)}>more</button>
              )}
            </div>
            <Link to="/about" className="appdl-developer">
              <span>
                <strong>E-MOORM</strong>
                <small>Developer</small>
              </span>
              <CaretRight size={18} weight="bold" aria-hidden="true" />
            </Link>
          </section>

          <section className="appdl-section appdl-install" aria-labelledby="appdl-install-title">
            <h2 id="appdl-install-title">{platform.kind === 'ios' ? 'On iPhone' : 'How to install'}</h2>
            {platform.kind === 'ios' ? <IphoneSteps /> : <AndroidSteps computer={platform.kind === 'computer'} />}
          </section>

          <section className="appdl-section appdl-info" aria-labelledby="appdl-info-title">
            <h2 id="appdl-info-title">Information</h2>
            <dl className="appdl-info-list">
              <div><dt>Provider</dt><dd>E-MOORM</dd></div>
              <div><dt>Size</dt><dd>{`${SIZE_MB} MB`}</dd></div>
              <div><dt>Category</dt><dd>Shopping</dd></div>
              <div><dt>Compatibility</dt><dd>{`Android ${release.minAndroid} or newer`}</dd></div>
              <div><dt>Languages</dt><dd>{LANGUAGES.join(', ')}</dd></div>
              <div><dt>Price</dt><dd>Free</dd></div>
              <div><dt>Version</dt><dd>{release.version}</dd></div>
              <div><dt>Updated</dt><dd>{releasedLabel}</dd></div>
              <div><dt>Package</dt><dd>{release.package}</dd></div>
            </dl>
            <details className="appdl-verify">
              <summary>
                <ShieldCheck size={19} weight="fill" aria-hidden="true" />
                Verify the download
                <CaretRight size={16} weight="bold" aria-hidden="true" className="appdl-verify-caret" />
              </summary>
              <p>
                The file you get should have this SHA-256 checksum, and be signed with this certificate. Android
                also checks the signature itself: an update installs only if it matches.
              </p>
              <dl>
                <div>
                  <dt>{`${FILE_NAME} · SHA-256`}</dt>
                  <dd><code>{release.sha256}</code></dd>
                </div>
                <div>
                  <dt>Signing certificate · SHA-256</dt>
                  <dd><code>{release.certificateSha256}</code></dd>
                </div>
              </dl>
            </details>
            <nav className="appdl-links" aria-label="More about E-MOORM">
              <Link to="/privacy">
                Privacy Policy
                <CaretRight size={16} weight="bold" aria-hidden="true" />
              </Link>
              <Link to="/terms">
                Terms of Service
                <CaretRight size={16} weight="bold" aria-hidden="true" />
              </Link>
              <Link to="/about">
                Developer Website
                <CaretRight size={16} weight="bold" aria-hidden="true" />
              </Link>
            </nav>
          </section>
        </div>

        <Sheet open={sheet === 'installing'} onClose={closeSheet} title="Downloading E-MOORM">
          {platform.kind === 'computer' ? (
            <div className="appdl-sheet-body">
              <p>
                It&apos;s an Android app: copy <strong>{FILE_NAME}</strong> to your Android phone and open it there.
                Easier: scan this with the phone&apos;s camera and tap <strong>Get</strong> on the phone.
              </p>
              <div className="appdl-sheet-qr">
                <QRCodeSVG
                  value={pageUrl}
                  size={148}
                  level="Q"
                  marginSize={0}
                  imageSettings={{
                    src: ICON_SMALL, width: 34, height: 34, excavate: true,
                  }}
                  title="QR code for emoorm.shop/app"
                />
              </div>
            </div>
          ) : (
            <div className="appdl-sheet-body">
              <ol className="appdl-steps">
                <AfterGetSteps />
              </ol>
            </div>
          )}
        </Sheet>

        <Sheet open={sheet === 'iphone'} onClose={closeSheet} title="E-MOORM on iPhone">
          <div className="appdl-sheet-body">
            <IphoneSteps />
          </div>
        </Sheet>

        {viewer !== null && <PreviewViewer start={viewer} onClose={closeViewer} />}
        {shareSheet}
      </div>
    </Layout>
  );
}
