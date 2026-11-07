import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import SellerPage from '../../src/components/seller/SellerPage';
import { HomeHead, HomeSection } from '../../src/components/seller/home/HomeCards';
import { TOOL_SECTIONS, useToolArt } from '../../src/components/seller/home/sellerTools';
import { font, t, themed } from '../../src/theme';

/**
 * /seller/tools: every tool in the Seller Center, grouped.
 *
 * Home shows the eight a seller opens most days; the arrow beside "Shop
 * tools" comes here for the rest. Same mark, same label, same four-across
 * grid, so a tool looks the same wherever it is met -- this page is Home's
 * tools section repeated under headings.
 *
 * It borrows Home's own section and head rather than restating them, and
 * the list lives in sellerTools.js, which Home picks its eight out of: two
 * places showing the same thing, one place saying what it is.
 */
export default function SellerToolsScreen() {
  const router = useRouter();
  // The look and size the super admin chose, as on Home's tools.
  const { look, size } = useToolArt();
  return (
    <SellerPage title="Shop tools">
      {TOOL_SECTIONS.map((section, i) => (
        <HomeSection key={section.key} last={i === TOOL_SECTIONS.length - 1}>
          <HomeHead title={section.title} />
          <View style={styles.grid}>
            {section.tools.map(({ key, to, label, Art, tone }) => (
              <Pressable
                key={key}
                accessibilityRole="link"
                accessibilityLabel={label}
                onPress={() => router.push(to)}
                style={({ pressed }) => [styles.tool, pressed && styles.toolPressed]}
              >
                <Art size={size} tone={tone} look={look} />
                <Text style={styles.label} numberOfLines={2}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </HomeSection>
      ))}
    </SellerPage>
  );
}

const styles = themed(() => StyleSheet.create({
  // Four across, the spacing Home's tools use.
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 18, marginHorizontal: -2, paddingBottom: 2 },
  tool: { width: '25%', minWidth: 0, alignItems: 'center', gap: 6, paddingHorizontal: 2 },
  toolPressed: { opacity: 0.6 },
  label: { fontSize: 12.5, lineHeight: 15.6, color: t.neutral[700], textAlign: 'center', ...font(400) },
}));
