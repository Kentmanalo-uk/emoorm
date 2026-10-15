import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CaretRightIcon, CheckIcon, ClockIcon, ExclamationMarkIcon } from 'phosphor-react-native';
import { font, t } from '../../../theme';
import { describeStep } from '../sellerSetup';
import { sellerHref } from '../sellerRoutes';
import { HomeSection, homeStyles } from './HomeCards';

/*
 * Phones: "Complete your shop" (web SellerDashboard.jsx HomeSetupCard +
 * SellerApp.css .sh-setup*): every setup step on one line with a tick
 * (done), a clock (waiting), a "!" (needs attention) or an empty circle (to
 * do), in the order a shop gets ready for orders. Each line opens the card
 * where it is done. Home leaves it out once the shop is complete.
 */
export default function HomeSetupCard({ setup }) {
  const router = useRouter();
  const context = { municipality: setup.municipality };
  const rows = (setup.steps || []).map((step) => ({ step, meta: describeStep(step, context) }));
  // The same count as Shop setup and the menu (optional steps left out).
  const { doneCount: done = 0, total = 0 } = setup;
  const percent = Math.round((done / Math.max(1, total)) * 100);

  return (
    <HomeSection accessibilityLabel="Complete your shop">
      <View style={[homeStyles.head, styles.head]}>
        <Text style={homeStyles.h2} accessibilityRole="header">Complete your shop</Text>
        <Text style={styles.count}>{done} of {total} done</Text>
      </View>
      <View
        style={styles.bar}
        accessibilityRole="progressbar"
        accessibilityLabel="Shop setup progress"
        accessibilityValue={{ min: 0, max: total, now: done }}
      >
        <View style={[styles.barFill, { width: `${percent}%` }]} />
      </View>
      <View style={styles.list}>
        {rows.map(({ step, meta }, i) => {
          const tag = meta.tone === 'waiting' ? 'Waiting'
            : meta.tone === 'failed' ? 'Needs attention'
              : meta.tone === 'done' ? null
                : meta.optional ? 'Optional'
                  : meta.neededToSell ? 'Needed to sell' : null;
          const body = (
            <>
              <View style={[styles.mark, MARKS[meta.tone]]}>
                {meta.tone === 'done' ? <CheckIcon size={12} weight="bold" color="#fff" /> : null}
                {meta.tone === 'waiting' ? <ClockIcon size={12} weight="bold" color="#fff" /> : null}
                {meta.tone === 'failed' ? <ExclamationMarkIcon size={12} weight="bold" color="#fff" /> : null}
              </View>
              <Text style={[styles.label, meta.tone === 'done' && styles.labelDone]}>{meta.label}</Text>
              {tag ? (
                <View style={[styles.tag, TAGS[tag === 'Needed to sell' ? 'sell' : meta.tone]]}>
                  <Text style={[styles.tagText, TAG_TEXT[tag === 'Needed to sell' ? 'sell' : meta.tone]]}>{tag}</Text>
                </View>
              ) : null}
              {meta.to ? <CaretRightIcon size={16} color={t.neutral[300]} /> : null}
            </>
          );
          const a11y = `${meta.label}${meta.tone === 'done' ? ' (done)' : ' (not done yet)'}${tag ? `, ${tag}` : ''}`;
          return meta.to ? (
            <Pressable
              key={step.key}
              accessibilityRole="link"
              accessibilityLabel={a11y}
              onPress={() => router.push(sellerHref(meta.to))}
              style={({ pressed }) => [styles.row, i > 0 && styles.rowLine, pressed && styles.rowPressed]}
            >
              {body}
            </Pressable>
          ) : (
            <View key={step.key} accessible accessibilityLabel={a11y} style={[styles.row, i > 0 && styles.rowLine]}>{body}</View>
          );
        })}
      </View>
    </HomeSection>
  );
}

const MARKS = {
  done: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  waiting: { borderColor: t.warning[500], backgroundColor: t.warning[500] },
  failed: { borderColor: t.danger[500], backgroundColor: t.danger[500] },
};
const TAGS = {
  sell: { backgroundColor: t.accent[50] },
  waiting: { backgroundColor: t.warning[50] },
  failed: { backgroundColor: t.danger[50] },
};
const TAG_TEXT = {
  sell: { color: t.accent[700] },
  waiting: { color: t.warning[700] },
  failed: { color: t.danger[700] },
};

const styles = StyleSheet.create({
  head: { marginBottom: 10 },
  count: { fontSize: 13, lineHeight: 20.8, color: t.neutral[500], ...font(400) },
  bar: { height: 6, marginBottom: 6, overflow: 'hidden', borderRadius: 999, backgroundColor: t.neutral[100] },
  barFill: { height: '100%', borderRadius: 999, backgroundColor: t.primary[600] },
  list: { marginHorizontal: -16, marginBottom: -6 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, paddingHorizontal: 16,
  },
  // The line sits on the list item, above the 50px row.
  rowLine: { minHeight: 51, borderTopWidth: 1, borderTopColor: t.neutral[100] },
  rowPressed: { backgroundColor: t.neutral[50] },
  mark: {
    width: 22, height: 22, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: t.neutral[300], borderRadius: 11,
  },
  label: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 24, color: t.neutral[800], ...font(400) },
  labelDone: { color: t.neutral[500] },
  tag: { flexShrink: 0, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, backgroundColor: t.neutral[100] },
  tagText: { fontSize: 11.5, lineHeight: 18.4, color: t.neutral[500], ...font(500) },
});
