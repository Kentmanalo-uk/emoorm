import { usePathname, useRouter } from 'expo-router';
import useAuthStore from '../store/authStore';

export default function useRequireAuth() {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (action, redirect = pathname) => {
    if (!isAuthenticated) {
      router.push({ pathname: '/login', params: { redirect } });
      return false;
    }
    action();
    return true;
  };
}
