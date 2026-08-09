import Toast, { BaseToast } from 'react-native-toast-message';
import { colors, fontFamily } from '../theme';

// Thin wrapper mirroring the `toast.success()` / `toast.error()` call convention used
// with react-hot-toast on web, backed by react-native-toast-message.
// Exported both ways since call sites use `import toast from ...` and `import { toast } from ...`.
export const toast = {
  success: (text1, text2) => Toast.show({ type: 'success', text1, text2, visibilityTime: 2600 }),
  error: (text1, text2) => Toast.show({ type: 'error', text1, text2, visibilityTime: 3200 }),
  info: (text1, text2) => Toast.show({ type: 'info', text1, text2, visibilityTime: 2600 }),
};

const toastCardProps = {
  style: {
    width: '92%',
    maxWidth: 420,
    minHeight: 56,
    height: 'auto',
    borderWidth: 1,
    borderLeftWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    backgroundColor: colors.white,
    elevation: 2,
  },
  contentContainerStyle: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  text1Style: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  text2Style: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  text1NumberOfLines: 2,
  text2NumberOfLines: 3,
};

const renderToastCard = (props) => <BaseToast {...props} {...toastCardProps} />;

export const toastConfig = {
  success: renderToastCard,
  error: renderToastCard,
  info: renderToastCard,
};

export default toast;
