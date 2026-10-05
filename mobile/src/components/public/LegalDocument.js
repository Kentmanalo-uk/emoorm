import { Fragment } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { font, t } from '../../theme';
import PublicHeader from './PublicHeader';

/*
 * A legal document page (web/src/pages/PrivacyPolicy.jsx, TermsOfService.jsx,
 * CookiePolicy.jsx with Legal.css at phone width). The page's h1 is the bar
 * title, as the website moves it there.
 *
 * blocks: [{ h2 }, { p: inline }, { ul: [inline, ...] }]
 * inline: a string, or an array of strings, { link, to } and { code }.
 */

// The website's .legal-page is pulled 12px past each edge by the phone
// "flat section" rule while keeping its 14px padding, so its text sits 2px
// from the screen edges. Kept as it shows.
const SIDE = 2;

function Inline({ value }) {
  const router = useRouter();
  const parts = Array.isArray(value) ? value : [value];
  return parts.map((part, i) => {
    if (typeof part === 'string') return <Fragment key={i}>{part}</Fragment>;
    if (part.code) return <Text key={i} style={styles.code}>{part.code}</Text>;
    const open = () => {
      if (/^mailto:|^https?:/.test(part.to)) Linking.openURL(part.to).catch(() => {});
      else router.push(part.to);
    };
    return <Text key={i} style={styles.link} onPress={open} accessibilityRole="link">{part.link}</Text>;
  });
}

export default function LegalDocument({ title, updated, blocks }) {
  return (
    <View style={styles.screen}>
      <PublicHeader title={title} />
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.p}>{updated}</Text>
        {blocks.map((block, i) => {
          if (block.h2) return <Text key={i} style={styles.h2} accessibilityRole="header">{block.h2}</Text>;
          if (block.ul) {
            return (
              <View key={i} style={styles.ul}>
                {block.ul.map((li, j) => (
                  <View key={j} style={[styles.li, j === block.ul.length - 1 && styles.liLast]}>
                    <View style={styles.bullet} />
                    <Text style={styles.liText}><Inline value={li} /></Text>
                  </View>
                ))}
              </View>
            );
          }
          return <Text key={i} style={styles.p}><Inline value={block.p} /></Text>;
        })}
      </ScrollView>
    </View>
  );
}

const LINE = 23; // 14px × 1.65, as the browser lays it out

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  page: { paddingTop: 18, paddingBottom: 6, paddingHorizontal: SIDE, backgroundColor: t.neutral[0] },
  p: { marginBottom: 14, fontSize: 14, lineHeight: LINE, color: t.neutral[700], ...font(400) },
  h2: { marginTop: 22 - 14, marginBottom: 8, fontSize: 16, lineHeight: 19, color: t.neutral[900], ...font(500) },
  ul: { marginBottom: 14, paddingLeft: 18 },
  li: { marginBottom: 6 },
  liLast: { marginBottom: 0 },
  bullet: {
    position: 'absolute', left: -14, top: LINE / 2 - 2.5, width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: t.neutral[700],
  },
  liText: { fontSize: 14, lineHeight: LINE, color: t.neutral[700], ...font(400) },
  link: { color: t.primary[600], ...font(500) },
  code: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontWeight: '400',
    fontSize: 13,
    color: t.neutral[700],
  },
});
