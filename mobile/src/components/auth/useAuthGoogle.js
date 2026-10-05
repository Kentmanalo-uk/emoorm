import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { GOOGLE_CANCELLED, GOOGLE_MESSAGES, onGoogleAnswer, startGoogleSignIn } from './googleSignIn';

/**
 * The Google button of the Log in / Sign up sheets: `start()` opens Google in
 * the phone's browser; the answer comes back through app/(auth)/google-signin.
 *
 * after: { from: 'login' | 'register', seller, redirect } (where to go after)
 * handlers: onAnswer(data) as from POST /auth/google, onError(message)
 * @returns {{ loading: Boolean, start: Function }}
 */
export default function useAuthGoogle(after, { onAnswer, onError }) {
  const [loading, setLoading] = useState(false);
  const latest = useRef({ onAnswer, onError });
  useEffect(() => {
    latest.current = { onAnswer, onError };
  });

  useEffect(() => onGoogleAnswer((answer) => {
    setLoading(false);
    if (answer.cancelled || GOOGLE_CANCELLED.includes(answer.error)) return;
    if (answer.data) latest.current.onAnswer(answer.data);
    else latest.current.onError(answer.message || GOOGLE_MESSAGES[answer.error] || 'Google sign-in did not finish. Please try again.');
  }), []);

  // Back from the browser without an answer (closed it): the button wakes up.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setTimeout(() => setLoading(false), 1500);
    });
    return () => sub.remove();
  }, []);

  const start = async () => {
    setLoading(true);
    const problem = await startGoogleSignIn(after);
    if (problem) {
      setLoading(false);
      latest.current.onError(problem);
    }
  };

  return { loading, start };
}
