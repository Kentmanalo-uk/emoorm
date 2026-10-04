import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CaretLeft } from '@phosphor-icons/react';
import Header from './Header';
import Footer from './Footer';
import PageMenu from './PageMenu';
import { usePhoneLayout } from '../../hooks/useMobileNav';
import { isBottomNavTab } from '../../lib/navTabs';
import './Layout.css';

// Page headings that are names, not page titles: they stay where they are.
const NOT_A_TITLE = '.pp-name, .pdp-title, .shop-m-name h1, .appdl-name';

// Phones: a few pages keep their grey, card-on-grey look (Home, search,
// a product); every other page is white, its sections running the full
// width (styles/phone-app.css).
const KEEPS_GREY = /^\/($|search|products|product\/[^/]+$)/;

/**
 * phoneBar: on phones, pages outside the five bottom-nav tabs get a top bar
 * with a back button and the page's title beside it ("← Followed Stores").
 * The title is the page's own first heading, moved up into the bar (and
 * hidden where it was), so every page gets one without a list to maintain;
 * a long heading can give a short one for the bar in data-bar-title.
 * Pages with their own top bar pass false.
 * phoneBackTo: where Back goes when there is no in-app history.
 * phoneBarEnd: the page's own action at the bar's right end (a Share button…),
 * before the page menu (⋯, PageMenu) that every bar ends with.
 */
const Layout = ({
  children, showFooter = true, phoneBar = true, phoneBackTo = '/', phoneBarEnd = null,
}) => {
  const isPhone = usePhoneLayout();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef(null);
  const [barTitle, setBarTitle] = useState('');
  // The page's heading stays in the page when it named a shorter bar title.
  const [barKeepsHeading, setBarKeepsHeading] = useState(false);
  const showBackBar = isPhone && phoneBar && !isBottomNavTab(pathname);
  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate(phoneBackTo));

  // Follow the page's first heading as it renders (and re-renders).
  useEffect(() => {
    const main = mainRef.current;
    if (!showBackBar || !main) return undefined;
    let tagged = null;
    const scan = () => {
      const heading = [...main.querySelectorAll('h1')]
        .find((h) => !h.closest('.layout-back-bar') && !h.matches(NOT_A_TITLE));
      const short = heading?.dataset.barTitle || '';
      if (tagged && tagged !== heading) tagged.removeAttribute('data-in-back-bar');
      if (heading && !short) heading.setAttribute('data-in-back-bar', '');
      tagged = heading || null;
      // A long heading can name a shorter bar title (data-bar-title) and stay
      // in the page.
      setBarTitle(heading ? (short || heading.textContent.trim()) : '');
      setBarKeepsHeading(Boolean(short));
    };
    const frame = requestAnimationFrame(scan);
    const observer = new MutationObserver(scan);
    observer.observe(main, { childList: true, subtree: true, characterData: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      tagged?.removeAttribute('data-in-back-bar');
    };
  }, [showBackBar, pathname]);

  return (
    <div className={`layout${KEEPS_GREY.test(pathname) ? '' : ' layout--flat'}`}>
      <Header />
      <main className="layout-main" ref={mainRef}>
        {showBackBar && (
          <div className="layout-back-bar">
            <button type="button" className="layout-back-btn" onClick={goBack} aria-label="Back">
              <CaretLeft size={22} weight="bold" />
            </button>
            {barTitle && (barKeepsHeading
              ? <span className="layout-back-title">{barTitle}</span>
              : <h1 className="layout-back-title">{barTitle}</h1>)}
            <div className="layout-back-end">
              {phoneBarEnd}
              <PageMenu />
            </div>
          </div>
        )}
        {children}
      </main>
      {showFooter && <Footer />}
    </div>
  );
};

export default Layout;
