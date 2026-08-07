import { ShoppingCart } from 'lucide-react-native';
import EmptyState from '../../src/components/EmptyState';
import { colors } from '../../src/theme';

export default function Cart() {
  return (
    <EmptyState
      icon={<ShoppingCart size={48} color={colors.gray400} />}
      title="Your Cart"
      message="Cart and checkout land in Phase 4."
    />
  );
}
