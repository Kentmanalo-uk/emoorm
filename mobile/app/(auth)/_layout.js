import { Stack } from 'expo-router';

// Log in, Sign up and the password sheets swap in place (the website's
// phone sheet fades between them instead of sliding up again).
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'fade', animationDuration: 160 }} />;
}
