import { useRef, useState } from 'react';
import {
  ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  EnvelopeSimpleIcon, FacebookLogoIcon, LifebuoyIcon, PaperPlaneRightIcon,
} from 'phosphor-react-native';
import apiClient from '../src/api/client';
import ScreenHeader from '../src/components/ScreenHeader';
import { ProfileSelect } from '../src/components/profile/ProfileAddressPicker';
import {
  FACEBOOK_URL, MESSAGE_MAX, SUBJECT_MAX, SUPPORT_CATEGORIES, SUPPORT_EMAIL, errorText,
} from '../src/components/profile/profileLib';
import useAuthStore from '../src/store/authStore';
import { toast } from '../src/lib/toast';
import { font, t } from '../src/theme';

/* The website's links, at the app's paths. */
const topics = [
  {
    title: 'Orders & Delivery',
    items: [
      { label: 'Tracking an order', to: '/orders' },
      { label: 'Cancelling an order', to: '/orders' },
      { label: 'Pickup locations', to: '/help-center?topic=delivery' },
    ],
  },
  {
    title: 'Payments',
    items: [
      { label: 'Accepted payment methods', to: '/help-center?topic=payments' },
      { label: 'Refund status', to: '/returns' },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Update your profile', to: '/settings' },
      { label: 'Reset your password', to: '/forgot-password' },
      { label: 'Manage addresses', to: '/addresses' },
    ],
  },
  {
    title: 'Selling on Emoorm',
    items: [
      { label: 'Apply as a seller', to: '/seller-apply' },
      { label: 'Seller dashboard', to: '/seller' },
    ],
  },
];

const topicGuides = {
  buying: {
    title: 'How to Buy',
    text: 'Browse products, choose a seller, add items to your cart, and complete checkout with your delivery or pickup details.',
  },
  returns: {
    title: 'Returns & Refunds',
    text: 'Open My Orders after delivery or pickup and tap Request return (usually within 7 days, or as the product\'s return policy says). The seller reviews your request and records any refund, which you can follow in Returns & refunds.',
  },
  delivery: {
    title: 'Shipping & Delivery',
    text: 'Each seller sets their delivery coverage and pickup location. Checkout shows available fulfillment options for the store you selected.',
  },
  payments: {
    title: 'Payment Methods',
    text: 'Sellers may offer Cash on Delivery, GCash or QR Ph. Nothing is paid at checkout: once the seller confirms your order it moves to To Pay in My Orders, where you scan the shop\'s QR, enter the reference number and upload a screenshot. The seller checks it before preparing your order.',
  },
};

const CATEGORY_OPTIONS = SUPPORT_CATEGORIES.map(([value, label]) => ({ value, label }));

/** A text field of the case form (.hc-field input / textarea). */
function HcInput({ multiline = false, style, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={t.neutral[500]}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      {...props}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.input, multiline && styles.textarea, focused && styles.inputFocus, style]}
    />
  );
}

/**
 * Start a support case (the website's GetHelpPanel): what it is about, a
 * subject and the message, sent to the municipal support team.
 */
function GetHelpPanel({ onLayout }) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [form, setForm] = useState({ category: 'ORDER', subject: '', message: '' });
  const [submitting, setSubmitting] = useState(false);

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    const subject = form.subject.trim();
    const message = form.message.trim();
    if (subject.length < 3) {
      toast.error('Give your case a short subject (at least 3 characters).');
      return;
    }
    if (!message) {
      toast.error('Tell us what you need help with.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiClient.post('/support/cases', { category: form.category, subject, message });
      toast.success('Your case was sent to your municipal support team.');
      setForm({ category: 'ORDER', subject: '', message: '' });
      router.push(res.data?.id ? `/support?c=${res.data.id}` : '/support');
    } catch (err) {
      toast.error(errorText(err, 'Could not send your request. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.panel} onLayout={onLayout}>
      <View style={styles.panelHead}>
        <View style={styles.panelIcon}><LifebuoyIcon size={22} weight="fill" color={t.primary[600]} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.panelTitle} accessibilityRole="header">Get help</Text>
          <Text style={styles.panelSub}>
            Orders, payments, an account problem or an idea for Emoorm — pick what it is about and
            your municipal admin replies in a thread you can follow.
          </Text>
        </View>
      </View>

      {!isAuthenticated ? (
        <View style={styles.signin}>
          <Text style={styles.signinText}>Sign in to start a case. Your answers and their replies are kept together in My Support Cases.</Text>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push({ pathname: '/login', params: { redirect: '/help-center' } })}
            style={({ pressed }) => [styles.submit, styles.signinBtn, pressed && { backgroundColor: t.primary[700] }]}
          >
            <Text style={[styles.submitText, { lineHeight: 21.6 }]}>Sign in to get help</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>What is it about?</Text>
            <ProfileSelect
              title="What is it about?"
              value={form.category}
              options={CATEGORY_OPTIONS}
              onChange={set('category')}
              style={styles.select}
              textStyle={styles.selectText}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Subject</Text>
            <HcInput
              value={form.subject}
              onChangeText={set('subject')}
              maxLength={SUBJECT_MAX}
              placeholder="e.g. My order has not arrived"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Tell us more</Text>
            <HcInput
              multiline
              value={form.message}
              onChangeText={set('message')}
              maxLength={MESSAGE_MAX}
              placeholder="Include order numbers, store names or anything else that helps us sort this out."
            />
          </View>

          <View style={styles.foot}>
            <Text style={styles.count}>{form.message.length}/{MESSAGE_MAX}</Text>
            <View style={styles.actions}>
              <Pressable accessibilityRole="link" onPress={() => router.push('/support')}>
                {({ pressed }) => <Text style={[styles.secondary, pressed && { textDecorationLine: 'underline' }]}>My support cases</Text>}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: submitting }}
                onPress={submit}
                disabled={submitting}
                style={({ pressed }) => [styles.submit, { flex: 1 }, pressed && { backgroundColor: t.primary[700] }, submitting && { opacity: 0.6 }]}
              >
                {submitting
                  ? <ActivityIndicator size={15} color="#fff" />
                  : <PaperPlaneRightIcon size={15} weight="fill" color="#fff" />}
                <Text style={styles.submitText}>{submitting ? 'Sending…' : 'Start a case'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      <View style={styles.reach}>
        <Text style={styles.reachText}>Other ways to reach us:</Text>
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {})} style={styles.reachLink}>
          <EnvelopeSimpleIcon size={16} weight="fill" color={t.primary[700]} />
          <Text style={styles.reachLinkText}>{SUPPORT_EMAIL}</Text>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(FACEBOOK_URL).catch(() => {})} style={styles.reachLink}>
          <FacebookLogoIcon size={16} weight="fill" color={t.primary[700]} />
          <Text style={styles.reachLinkText}>Message us on Facebook</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * /help (web/src/pages/HelpCenter.jsx): a topic's short guide when one is
 * asked for (?topic=), the support case form, and the topic links.
 */
export default function HelpCenter() {
  const router = useRouter();
  const { topic } = useLocalSearchParams();
  const guide = topicGuides[topic];
  const scrollRef = useRef(null);
  const panelY = useRef(0);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Help & Support" />
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.subtitle, { marginBottom: 4 }]}>
          Answers to the usual questions, and a way to reach a real person when you need one.
        </Text>

        {guide ? (
          <View style={styles.topicCard}>
            <Text style={styles.topicTitle} accessibilityRole="header">{guide.title}</Text>
            <Text style={[styles.subtitle, { marginBottom: 4 }]}>{guide.text}</Text>
            <Pressable
              accessibilityRole="link"
              onPress={() => scrollRef.current?.scrollTo({ y: panelY.current, animated: true })}
              style={styles.topicLink}
            >
              <Text style={styles.topicLinkText}>Need more help? Start a support case</Text>
            </Pressable>
          </View>
        ) : null}

        <GetHelpPanel onLayout={(e) => { panelY.current = e.nativeEvent.layout.y; }} />

        <View style={styles.topics}>
          {topics.map((group) => (
            <View key={group.title} style={styles.topicCard}>
              <Text style={styles.topicTitle} accessibilityRole="header">{group.title}</Text>
              <View>
                {group.items.map((item, i) => (
                  <Pressable
                    key={item.label}
                    accessibilityRole="link"
                    onPress={() => router.push(item.to)}
                    style={[styles.topicLink, i > 0 && styles.topicLine]}
                  >
                    {({ pressed }) => (
                      <Text style={[styles.topicLinkText, pressed && { color: t.primary[800], textDecorationLine: 'underline' }]}>{item.label}</Text>
                    )}
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  content: { gap: 12, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 24 },
  subtitle: { fontSize: 14, lineHeight: 21, color: t.neutral[500], ...font(400) },

  panel: {
    marginHorizontal: -12, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16,
    backgroundColor: t.neutral[0], borderBottomWidth: 8, borderBottomColor: t.neutral[100],
  },
  panelHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  panelIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[50] },
  panelTitle: { marginBottom: 4, fontSize: 17, lineHeight: 19.55, color: t.neutral[900], ...font(500) },
  panelSub: { fontSize: 13.5, lineHeight: 20.25, color: t.neutral[500], ...font(400) },

  signin: {
    gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: t.neutral[300],
    borderRadius: 10, backgroundColor: t.neutral[50],
  },
  signinText: { fontSize: 13.5, lineHeight: 21.6, color: t.neutral[600], ...font(400) },
  signinBtn: { alignSelf: 'stretch' },

  form: { gap: 14 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 12.5, lineHeight: 20, color: t.neutral[700], ...font(500) },
  select: { minHeight: 46, paddingVertical: 9, paddingHorizontal: 11, borderRadius: 8, borderColor: t.neutral[300] },
  selectText: { fontSize: 14, lineHeight: 22.4, color: t.neutral[900] },
  input: {
    minHeight: 46, paddingVertical: 9, paddingHorizontal: 11, borderWidth: 1, borderColor: t.neutral[300], borderRadius: 8,
    backgroundColor: t.neutral[0], color: t.neutral[900], fontSize: 14, lineHeight: 22.4, ...font(400),
  },
  textarea: { height: 125, lineHeight: 21 },
  inputFocus: { borderColor: t.primary[600] },
  foot: { gap: 10 },
  count: { fontSize: 12, lineHeight: 19.2, color: t.neutral[500], ...font(400) },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  secondary: { fontSize: 13.5, lineHeight: 21.6, color: t.primary[700], ...font(500) },
  submit: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8, backgroundColor: t.primary[600],
  },
  submitText: { fontSize: 13.5, lineHeight: 16.2, color: '#fff', ...font(500) },

  reach: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 8,
    marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.neutral[100],
  },
  reachText: { fontSize: 13.5, lineHeight: 21.6, color: t.neutral[500], ...font(400) },
  reachLink: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reachLinkText: { fontSize: 13.5, lineHeight: 21.6, color: t.primary[700], ...font(500) },

  topics: { gap: 12 },
  topicCard: {
    marginHorizontal: -12, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 6,
    backgroundColor: t.neutral[0], borderBottomWidth: 1, borderBottomColor: t.neutral[200],
  },
  topicTitle: { marginBottom: 4, fontSize: 16, lineHeight: 18.4, color: t.neutral[900], ...font(500) },
  topicLink: { minHeight: 44, justifyContent: 'center' },
  topicLine: { borderTopWidth: 1, borderTopColor: t.neutral[150] },
  topicLinkText: { fontSize: 14, lineHeight: 22.4, color: t.primary[700], ...font(400) },
});
