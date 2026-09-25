// The five pages that carry the phone bottom navigation. Every other page
// hides it and, unless it brings its own top bar, gets a back button.
export const BOTTOM_NAV_TABS = ['/', '/cart', '/messages', '/notifications', '/profile'];

export const isBottomNavTab = (pathname) => BOTTOM_NAV_TABS.includes(pathname);
