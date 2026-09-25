import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CaretLeft } from '@phosphor-icons/react';
import Header from './Header';
import Footer from './Footer';
import { usePhoneLayout } from '../../hooks/useMobileNav';
import { isBottomNavTab } from '../../lib/navTabs';
import './Layout.css';

// Page headings that are names, not page titles: they stay where they are.
const NOT_A_TITLE = '.pp-name, .pdp-title, .shop-m-name h1';

/**
 * phoneBar: on phones, pages outside the five bottom-nav tabs get a top bar
 * with a back button and the page's title beside it ("← Followed Stores").
 * The title is the page's own first heading, moved up into the bar (and
 * hidden where it was), so every page gets one without a list to maintain.
 * Pages with their own top bar pass false.
 * phoneBackTo: where Back goes when there is no in-app history.
 */
const Layout = ({ children, showFooter = true, phoneBar = true, phoneBackTo = '/' }) => {
  const isPhone = usePhoneLayout();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef(null);
  const [barTitle, setBarTitle] = useState('');
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
      if (tagged && tagged !== heading) tagged.removeAttribute('data-in-back-bar');
      if (heading) heading.setAttribute('data-in-back-bar', '');
      tagged = heading || null;
      setBarTitle(heading ? heading.textContent.trim() : '');
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
    <div className="layout">
      <Header />
      <main className="layout-main" ref={mainRef}>
        {showBackBar && (
          <div className="layout-back-bar">
            <button type="button" className="layout-back-btn" onClick={goBack} aria-label="Back">
              <CaretLeft size={22} weight="bold" />
            </button>
            {barTitle && <h1 className="layout-back-title">{barTitle}</h1>}
          </div>
        )}
        {children}
      </main>
      {showFooter && <Footer />}
    </div>
  );
};

export default Layout;
