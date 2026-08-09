import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { Package } from 'lucide-react-native';
import Button from '../src/components/Button';
import TextField from '../src/components/TextField';
import ProductCard from '../src/components/ProductCard';
import StatusBadge from '../src/components/StatusBadge';
import EmptyState from '../src/components/EmptyState';
import LoadingSkeleton from '../src/components/LoadingSkeleton';
import StarRating from '../src/components/StarRating';
import { colors, spacing, typography } from '../src/theme';

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function DesignSystemDemo() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Section title="Buttons">
        <View style={styles.row}>
          <Button title="Primary" onPress={() => { }} style={styles.flexItem} />
          <Button title="Secondary" variant="secondary" onPress={() => { }} style={styles.flexItem} />
        </View>
        <View style={styles.row}>
          <Button title="Danger" variant="danger" onPress={() => { }} style={styles.flexItem} />
          <Button title="Loading" loading onPress={() => { }} style={styles.flexItem} />
        </View>
      </Section>

      <Section title="Text Field">
        <TextField label="Email" placeholder="you@example.com" />
        <TextField label="Password" placeholder="••••••••" secureTextEntry error="Password is required" />
      </Section>

      <Section title="Star Rating">
        <StarRating rating={3.5} />
      </Section>

      <Section title="Status Badges">
        <View style={styles.badgeRow}>
          <StatusBadge status="PENDING" />
          <StatusBadge status="TO_SHIP" />
          <StatusBadge status="COMPLETED" />
          <StatusBadge status="CANCELLED" />
        </View>
      </Section>

      <Section title="Product Card — Grid">
        <View style={styles.row}>
          <ProductCard
            name="Fresh Calamansi (1kg)"
            price={45}
            rating={4}
            reviewCount={12}
            onPress={() => { }}
            onAddToCart={() => { }}
          />
          <ProductCard
            name="Handwoven Nito Bag"
            price={350}
            rating={5}
            reviewCount={3}
            onPress={() => { }}
            onAddToCart={() => { }}
          />
        </View>
      </Section>

      <Section title="Product Card — List">
        <ProductCard
          variant="list"
          name="Organic Brown Rice (5kg)"
          price={220}
          rating={4.5}
          reviewCount={28}
          onPress={() => { }}
          onAddToCart={() => { }}
        />
      </Section>

      <Section title="Loading Skeleton">
        <LoadingSkeleton width="100%" height={16} style={{ marginBottom: spacing.xs }} />
        <LoadingSkeleton width="70%" height={16} />
      </Section>

      <Section title="Empty State">
        <View style={styles.emptyStateBox}>
          <EmptyState
            icon={<Package size={40} color={colors.gray400} />}
            title="Nothing here yet"
            message="This is what an empty list looks like."
            actionLabel="Refresh"
            onAction={() => { }}
          />
        </View>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.xl,
    backgroundColor: colors.bgPrimary,
  },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.h3, color: colors.textPrimary },
  row: { flexDirection: 'row', gap: spacing.sm },
  flexItem: { flex: 1 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  emptyStateBox: { height: 220, borderRadius: 8 },
});
