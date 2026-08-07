import { ClipboardList } from 'lucide-react-native';
import EmptyState from '../../src/components/EmptyState';
import { colors } from '../../src/theme';

// Reachable from Profile's "My Purchase" section, not a bottom tab (see (tabs)/_layout.js).
export default function Orders() {
  return (
    <EmptyState
      icon={<ClipboardList size={48} color={colors.gray400} />}
      title="Your Orders"
      message="Order tracking and status tabs land in Phase 5."
    />
  );
}
