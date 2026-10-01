/**
 * Where to go after signing out. Phones land on the visitor Profile tab (sign
 * in, sign up, help), the app's own "you're signed out" home; computers go
 * where each page always sent them. Same breakpoint as usePhoneLayout.
 * @param {String} desktopPath
 */
export const afterSignOutPath = (desktopPath) => (
  typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches ? '/profile' : desktopPath
);

export default afterSignOutPath;
