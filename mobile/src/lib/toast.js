import Toast from 'react-native-toast-message';

// Thin wrapper mirroring the `toast.success()` / `toast.error()` call convention used
// with react-hot-toast on web, backed by react-native-toast-message.
// Exported both ways since call sites use `import toast from ...` and `import { toast } from ...`.
export const toast = {
  success: (text1, text2) => Toast.show({ type: 'success', text1, text2 }),
  error: (text1, text2) => Toast.show({ type: 'error', text1, text2 }),
  info: (text1, text2) => Toast.show({ type: 'info', text1, text2 }),
};

export default toast;
