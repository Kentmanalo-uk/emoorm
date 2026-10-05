import { Redirect } from 'expo-router';

// web/src/App.jsx: /feedback is an old address that now opens Help (/help,
// the app's /help-center), replacing the entry.
export default function RedirectToHelp() {
  return <Redirect href="/help-center" />;
}
