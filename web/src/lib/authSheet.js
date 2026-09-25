// On phones Log in, Sign up and the password screens open as a sheet over
// the page the shopper was on (see AppRoutes in App.jsx and
// components/AuthSheetBar.jsx).
export const AUTH_SHEET_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

export const isAuthSheetPath = (pathname) => AUTH_SHEET_PATHS.includes(pathname);

// What sits behind the sheet when /login is opened directly.
export const HOME_BACKGROUND = { pathname: '/', search: '', hash: '', state: null, key: 'auth-sheet-home' };
