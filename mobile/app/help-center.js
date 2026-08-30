import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CaretDownIcon as ChevronDown, CaretUpIcon as ChevronUp, EnvelopeIcon as Mail, ChatCircleDotsIcon as MessageCircleQuestion } from 'phosphor-react-native';
import ScreenHeader from '../src/components/ScreenHeader';
import { colors, fontFamily, radius, spacing, typography } from '../src/theme';

const FAQS = [
  ['How do I track an order?', 'Open Profile, choose My Orders, then select an order to view its current status and fulfillment details.'],
  ['Can I cancel an order?', 'Pending and confirmed orders can be cancelled from Order Details. Later stages require contacting the seller.'],
  ['How do delivery and pickup work?', 'Each store controls its available fulfillment methods. Checkout only shows methods supported by every store in that order.'],
  ['How do I become a seller?', 'Open Profile, choose Start Selling, and submit your shop and identity verification details.'],
  ['How do I report a payment issue?', 'Message the seller from Order Details and include your order number and payment reference.'],
];

export default function HelpCenter() {
  const [open, setOpen] = useState(0);
  return <View style={styles.screen}><ScreenHeader title="Help Center" subtitle="Orders, payments, and selling" /><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.intro}><MessageCircleQuestion size={28} color={colors.secondary} /><Text style={styles.introTitle}>How can we help?</Text><Text style={styles.introText}>Find quick answers about shopping and selling on E-MOORM.</Text></View>
    <View style={styles.faq}>{FAQS.map(([question, answer], index) => <Pressable key={question} style={styles.item} onPress={() => setOpen(open === index ? -1 : index)}><View style={styles.questionRow}><Text style={styles.question}>{question}</Text>{open === index ? <ChevronUp size={18} color={colors.secondary} /> : <ChevronDown size={18} color={colors.textMuted} />}</View>{open === index ? <Text style={styles.answer}>{answer}</Text> : null}</Pressable>)}</View>
    <Pressable style={styles.contact} onPress={() => Linking.openURL('mailto:support@emoorm.app')}><Mail size={18} color={colors.white} /><View><Text style={styles.contactTitle}>Still need help?</Text><Text style={styles.contactText}>Email support@emoorm.app</Text></View></Pressable>
  </ScrollView></View>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.bgSecondary }, content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl }, intro: { alignItems: 'center', padding: spacing.xl, borderRadius: radius.lg, backgroundColor: colors.bgGreenLight }, introTitle: { ...typography.h2, color: colors.textPrimary, marginTop: spacing.sm }, introText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs }, faq: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.white }, item: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight }, questionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, question: { ...typography.body, flex: 1, fontFamily: fontFamily.semiBold, color: colors.textPrimary }, answer: { ...typography.body, color: colors.textSecondary, lineHeight: 21, marginTop: spacing.sm }, contact: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.secondary }, contactTitle: { ...typography.body, fontFamily: fontFamily.semiBold, color: colors.white }, contactText: { ...typography.caption, color: colors.white, marginTop: 2 } });
