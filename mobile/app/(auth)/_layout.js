import { Stack } from 'expo-router';

// Log in, Sign up and the password sheets swap in place (the website's
// phone sheet fades between them instead of sliding up again).
export default function AuthLayout() {
  // Transparent, so the page the sheet was opened over shows around it
  // while it slides (the sheet paints its own white).
  return <Stack screenOptions={{ headerShown: false, animation: 'fade', animationDuration: 160, contentStyle: { backgroundColor: 'transparent' } }} />;
}
