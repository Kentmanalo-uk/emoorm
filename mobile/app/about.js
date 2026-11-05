import { useEffect, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { ArrowRightIcon } from '../src/lib/icons';
import PublicHeader from '../src/components/public/PublicHeader';
import HomeFooter from '../src/components/home/HomeFooter';
import StepArt from '../src/components/about/StepArt';
import apiClient from '../src/api/client';
import { fetchCategories, fetchMunicipalities } from '../src/lib/referenceData';
import {
  activeScheme, font, t, themed,
} from '../src/theme';

/*
 * About Emoorm: web/src/pages/About.jsx + About.css at phone width (the
 * phone build reads its bold weights as medium, so the page is in 500).
 *
 * Its centre is the province itself: the hero is the fifteen towns of
 * Oriental Mindoro set as one wall of type on the brand green, solid and
 * outlined in turn, the capital in pink, each a link to its town's page.
 * After it each section has a form of its own: the mission as one large
 * sentence, how buying works with a picture per step, what you can do as
 * an index on dark, the team as their names, one closing line, and the
 * website's footer. No cards, no icon tiles.
 */

/* Until the live list answers (and the order it is shown in). */
const TOWNS = [
  'Baco', 'Bansud', 'Bongabong', 'Bulalacao', 'Calapan City', 'Gloria', 'Mansalay', 'Naujan',
  'Pinamalayan', 'Pola', 'Puerto Galera', 'Roxas', 'San Teodoro', 'Socorro', 'Victoria',
];
const CAPITAL = /calapan/i;

const FLOW = [
  { art: 'find', word: 'Find', text: 'Search, pick a category, or open a town.' },
  { art: 'order', word: 'Order', text: 'Delivery or pickup, from the seller you choose.' },
  { art: 'pay', word: 'Pay the seller', text: 'Cash on delivery, GCash or QR Ph. Emoorm never holds it.' },
  { art: 'receive', word: 'Receive', text: 'Updates as it is confirmed, packed and handed over.' },
];

const CAN_DO = [
  ['Buy from the source', 'Every shop is run by a local seller who manages their own listings, stock and orders.'],
  ['Trust who you buy from', 'Sellers and new listings are checked by a municipal or platform administrator first.'],
  ['Get it delivered, or pick it up', 'Sellers choose the barangays they deliver to, or offer pickup, or both.'],
  ['Check out safely', 'Buyers verify once with a valid Philippine ID. The photo is read, never stored.'],
  ['Talk to sellers', 'Ask about a product or an order, and reach your town’s administrator for help.'],
  ['Return what is wrong', 'Damaged, wrong or incomplete items can be returned; rate what you bought.'],
  ['Find sellers near you', 'On the store map, or search with a photo of what you want.'],
  ['Shop in your language', 'English, Tagalog or Bisaya, whichever you are most at home in.'],
];

const TEAM = [
  { name: 'Mike Fernandez', role: 'Developer' },
  { name: 'Kent Manalo', role: 'Developer' },
  { name: 'John Paul Quisto', role: 'Developer' },
];

/*
 * The page's colours (About.css's --ab-*). In dark mode the brand green
 * stays the deep one, so the hero's white type still reads (the dark ramps
 * put a bright mint at 600).
 */
const C = themed(() => {
  const dark = activeScheme() === 'dark';
  return {
    green: dark ? t.primary[400] : t.primary[600],
    // Words on the page (not on the green): the theme's own green.
    word: t.primary[600],
    pink: t.accent[500],
    pinkSoft: dark ? t.accent[700] : t.accent[300],
  };
});

// The towns' type: 30px, line-height 1.18, -0.035em, medium.
const TOWN_SIZE = 30;
const TOWN_LINE = 35.4;
/*
 * A town "in outline" (web: -webkit-text-stroke, no fill). React Native has
 * no text stroke, and an SVG outline laid over the text lands off the
 * letters on Android (its font metrics differ), so the app shows these
 * names in a faded white instead: the alternation still tells one name
 * from the next.
 */
function OutlineTown({ name, style }) {
  return <Text style={[style, styles.faded]}>{name}</Text>;
}

export default function About() {
  const router = useRouter();
  const focused = useIsFocused();
  const go = (to) => () => router.push(to);
  // The towns, with their pages once the list is in; and the website's
  // footer (links, directory, town seals), which closes this page.
  const [footer, setFooter] = useState({ municipalities: [], categories: [], appLogo: null });
  useEffect(() => {
    let live = true;
    Promise.all([
      fetchMunicipalities().catch(() => []),
      fetchCategories().catch(() => []),
      apiClient.get('/app-settings').then((res) => res?.data?.appLogo || null).catch(() => null),
    ]).then(([municipalities, categories, appLogo]) => {
      if (live) setFooter({ municipalities: municipalities || [], categories: categories || [], appLogo });
    });
    return () => { live = false; };
  }, []);

  const towns = footer.municipalities.length
    ? [...footer.municipalities].sort((a, b) => a.name.localeCompare(b.name)).map((m) => ({ name: m.name, id: m.id }))
    : TOWNS.map((name) => ({ name, id: null }));

  return (
    <View style={styles.screen}>
      <PublicHeader title="About Emoorm" />
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}>
        {/* The province, town by town. */}
        <View style={[styles.hero, { backgroundColor: C.green }]}>
          <View style={styles.wrap}>
            <Text style={styles.title} accessibilityRole="header">
              {'One market for '}
              <Text style={{ color: C.pinkSoft }}>all of Oriental Mindoro.</Text>
            </Text>
            <Text style={styles.lead}>
              Emoorm brings the farmers, fisherfolk, cooks and makers of every town online, so what the province
              grows, catches and makes reaches buyers in every other.
            </Text>
          </View>
          {/* Solid and outlined in turn: that, not a separator, tells one
              name from the next, however the lines wrap. */}
          <View style={styles.towns} accessibilityLabel={`The ${towns.length} towns Emoorm serves`}>
            {towns.map((town, i) => {
              const capital = CAPITAL.test(town.name);
              const outline = !capital && i % 2 === 1;
              const word = outline
                ? <OutlineTown name={town.name} style={styles.town} />
                : <Text style={[styles.town, capital && { color: C.pinkSoft }]}>{town.name}</Text>;
              return town.id ? (
                <Pressable
                  key={town.name}
                  accessibilityRole="link"
                  accessibilityLabel={town.name}
                  onPress={go(`/municipality/${town.id}`)}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  {word}
                </Pressable>
              ) : <View key={town.name}>{word}</View>;
            })}
          </View>
        </View>

        {/* Why it exists, said once and large. */}
        <View style={[styles.wrap, styles.mission]}>
          <Text style={styles.quote}>
            Market days, word of mouth and long rides between towns used to decide who a seller could reach.
            <Text style={{ color: C.word }}> Now a shop is a phone away.</Text>
          </Text>
          <View style={styles.missionText}>
            <Text style={styles.para}>
              Emoorm gives every local producer a store they run themselves, and gives buyers one place to find
              and order what is made and grown in the province.
            </Text>
            <Text style={styles.para}>
              Buyers pay the seller directly, by cash on delivery, GCash or QR Ph. Emoorm takes no commission and
              never holds the money.
            </Text>
            <Pressable
              accessibilityRole="link"
              onPress={go('/sell')}
              style={({ pressed }) => [styles.link, pressed && styles.pressed]}
            >
              <Text style={[styles.linkText, { color: C.word }]}>Open a shop</Text>
              <ArrowRightIcon size={16} color={C.word} />
            </Pressable>
          </View>
        </View>

        {/* How buying works, a picture per step. */}
        <View style={[styles.wrap, styles.flow]}>
          <Text style={styles.h2} accessibilityRole="header">How buying works</Text>
          <View style={styles.flowLine}>
            {FLOW.map((step, i) => (
              <View key={step.word} style={styles.flowStep}>
                <StepArt kind={step.art} size={84} running={focused} />
                <View style={styles.flowBody}>
                  <Text style={[styles.flowWord, { color: i === FLOW.length - 1 ? C.pink : C.word }]}>{step.word}</Text>
                  <Text style={styles.flowText}>{step.text}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* What you can do: an index on dark. */}
        <View style={styles.index}>
          <View style={styles.wrap}>
            <Text style={[styles.h2, styles.onDark]} accessibilityRole="header">What you can do here</Text>
            <View style={styles.indexList}>
              {CAN_DO.map(([title, text]) => (
                <View key={title} style={styles.indexItem}>
                  <Text style={styles.indexTitle}>{title}</Text>
                  <Text style={styles.indexText}>{text}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Who made it. */}
        <View style={[styles.wrap, styles.team]}>
          <Text style={styles.h2} accessibilityRole="header">Made in Mindoro.</Text>
          <Text style={styles.teamNote}>
            Emoorm was built by Bachelor of Science in Information Technology students of Mindoro State
            University, under the guidance of Prof. Christian Cabrera.
          </Text>
          <View style={styles.names}>
            {TEAM.map((p, i) => (
              <View key={p.name} style={[styles.name, i === 0 && styles.nameFirst]}>
                <Text style={styles.nameText}>{p.name}</Text>
                <Text style={styles.nameRole}>{`${p.role} · BSIT 4th year`}</Text>
              </View>
            ))}
            <View style={styles.name}>
              <Text style={[styles.nameText, { color: C.word }]}>Christian Cabrera</Text>
              <Text style={styles.nameRole}>Project adviser · Professor</Text>
            </View>
          </View>
        </View>

        <View style={[styles.wrap, styles.close]}>
          <Pressable
            accessibilityRole="link"
            onPress={go('/help-center')}
            style={({ pressed }) => [styles.closeLink, pressed && styles.pressed]}
          >
            <Text style={styles.closeText}>Questions or feedback?</Text>
            <View style={styles.closeGo}>
              <Text style={[styles.closeText, { color: C.pink }]}>Talk to us</Text>
              <ArrowRightIcon size={28} color={C.pink} />
            </View>
          </Pressable>
        </View>

        <HomeFooter municipalities={footer.municipalities} categories={footer.categories} appLogo={footer.appLogo} />
      </ScrollView>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  wrap: { paddingHorizontal: 20 },
  pressed: { opacity: 0.7 },
  h2: {
    fontSize: 30, lineHeight: 31.5, letterSpacing: -1.05, color: t.neutral[900], ...font(500),
  },

  // ── hero: the towns ──
  hero: { paddingTop: 36, paddingBottom: 48 },
  title: {
    marginBottom: 16, fontSize: 40, lineHeight: 39.2, letterSpacing: -1.8, color: '#ffffff', ...font(500),
  },
  lead: {
    marginBottom: 40, fontSize: 16, lineHeight: 25.6, color: 'rgba(255, 255, 255, 0.82)', ...font(400),
  },
  towns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'center',
    columnGap: 16.5,
    paddingHorizontal: 16,
  },
  town: {
    fontSize: TOWN_SIZE,
    lineHeight: TOWN_LINE,
    letterSpacing: -1.05,
    color: '#ffffff',
    ...font(500),
  },
  faded: { color: 'rgba(255, 255, 255, 0.5)' },

  // ── mission ──
  mission: { paddingVertical: 64, gap: 32 },
  quote: {
    fontSize: 27, lineHeight: 31.05, letterSpacing: -0.81, color: t.neutral[900], ...font(500),
  },
  missionText: {},
  para: {
    marginBottom: 16, fontSize: 16, lineHeight: 26.4, color: t.neutral[600], ...font(400),
  },
  link: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginTop: 6,
  },
  linkText: { fontSize: 16, lineHeight: 25.6, ...font(500) },

  // ── how buying works ──
  flow: {
    paddingVertical: 56, borderTopWidth: 1, borderTopColor: t.neutral[200],
  },
  flowLine: { marginTop: 28, gap: 24 },
  flowStep: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  flowBody: { flex: 1, minWidth: 0 },
  flowWord: {
    marginBottom: 6, fontSize: 28, lineHeight: 44.8, letterSpacing: -0.84, ...font(500),
  },
  flowText: {
    fontSize: 16, lineHeight: 24.8, color: t.neutral[600], ...font(400),
  },

  // ── what you can do: on dark, in either mode ──
  index: { paddingVertical: 56, backgroundColor: '#0f1a14' },
  onDark: { color: '#ffffff' },
  indexList: { marginTop: 28 },
  indexItem: {
    gap: 6, paddingVertical: 18, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  indexTitle: {
    fontSize: 18, lineHeight: 28.8, letterSpacing: -0.18, color: '#ffffff', ...font(500),
  },
  indexText: {
    fontSize: 15.5, lineHeight: 24.025, color: 'rgba(255, 255, 255, 0.62)', ...font(400),
  },

  // ── team ──
  team: { paddingVertical: 64 },
  teamNote: {
    marginTop: 14, fontSize: 16, lineHeight: 26.4, color: t.neutral[600], ...font(400),
  },
  names: { marginTop: 32 },
  name: {
    gap: 4, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: t.neutral[200],
  },
  nameFirst: { paddingTop: 0 },
  nameText: {
    fontSize: 26, lineHeight: 41.6, letterSpacing: -0.78, color: t.neutral[900], ...font(500),
  },
  nameRole: {
    fontSize: 15, lineHeight: 24, color: t.neutral[600], ...font(400),
  },

  // ── close: one line ──
  close: { paddingBottom: 64, marginBottom: 32 },
  closeLink: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    rowGap: 12,
    columnGap: 32,
    paddingVertical: 28,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: t.neutral[900],
  },
  closeText: {
    fontSize: 26, lineHeight: 41.6, letterSpacing: -0.78, color: t.neutral[900], ...font(500),
  },
  closeGo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
}));
