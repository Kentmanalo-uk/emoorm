import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FloppyDiskIcon, ImageIcon, MapPinIcon, PaletteIcon, StorefrontIcon,
} from '../../../src/lib/icons';
import apiClient from '../../../src/api/client';
import { toast } from '../../../src/lib/toast';
import { font, t, themed } from '../../../src/theme';
import LoadingSkeleton from '../../../src/components/LoadingSkeleton';
import LocationPicker from '../../../src/components/maps/LocationPicker';
import SellerPage, { SellerPrivateLine, sellerPageStyles } from '../../../src/components/seller/SellerPage';
import { useSellerShell } from '../../../src/components/seller/SellerShell';
import { SettingsList, SettingsRow } from '../../../src/components/seller/store/StoreSettingsList';
import { Field, FormInput } from '../../../src/components/seller/store/StoreFields';
import {
  DEFAULT_PRIMARY, DEFAULT_SECONDARY, DESCRIPTION_MAX, PART_OF_ANCHOR, aboutProblem, paintColor, partPath, useStoreForm,
} from '../../../src/components/seller/store/storeLib';
import { PageLoader } from '../../../src/components/BrandLoader';

/*
 * /seller/store (Shop profile) on phones (web/src/pages/SellerStore.jsx, the
 * phone branch): the profile's parts as a list (Name & description, Logo &
 * banner, Location, Shop colors), each row showing what is set now and
 * opening its own page (app/seller/store/[part].js). Links written for the
 * website's one-page layout (/seller/store#branding, here ?focus=branding)
 * open the part's page. A seller with no shop yet gets the "Create Store"
 * form, as the website shows it.
 */
export default function SellerStoreScreen() {
  const router = useRouter();
  const { focus } = useLocalSearchParams();
  const anchorPart = PART_OF_ANCHOR[String(focus || '')];
  const { form, setForm, isLoading, isNew, reload } = useStoreForm();

  // Back from a part's page (this list stays mounted under it): show what it saved.
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) {
      firstFocus.current = false;
      return;
    }
    reload();
  }, [reload]));

  useEffect(() => {
    if (anchorPart) router.replace(partPath(anchorPart));
  }, [anchorPart, router]);

  if (isLoading || anchorPart) {
    return (
      <SellerPage>
        <PageLoader label="Loading" />
      </SellerPage>
    );
  }

  if (isNew) return <CreateStore form={form} setForm={setForm} onCreated={reload} />;

  const hasLogo = Boolean(form.logo);
  const hasBanner = Boolean(form.bannerImage || form.coverImage);
  const pinned = form.latitude != null && form.longitude != null;
  const ownColors = form.primaryColor !== DEFAULT_PRIMARY || form.secondaryColor !== DEFAULT_SECONDARY;
  const open = (part) => () => router.push(partPath(part));

  return (
    <SellerPage>
      <SettingsList label="Shop profile">
        <SettingsRow
          onPress={open('about')}
          Icon={StorefrontIcon}
          label="Name & description"
          value={form.description.trim() ? form.name : `${form.name} · Add a description`}
          missing={!form.description.trim()}
        />
        <SettingsRow
          onPress={open('branding')}
          Icon={ImageIcon}
          label="Logo & banner"
          value={hasLogo && hasBanner
            ? 'Logo and banner added'
            : !hasLogo && !hasBanner ? 'Add a logo and a banner' : !hasLogo ? 'Add a logo' : 'Add a banner'}
          missing={!hasLogo || !hasBanner}
        />
        <SettingsRow
          onPress={open('location')}
          Icon={MapPinIcon}
          label="Location"
          value={pinned ? (form.pickupAddress.trim() || 'Pinned on the map') : 'Pin your shop on the map'}
          missing={!pinned}
        />
        <SettingsRow
          onPress={open('colors')}
          Icon={PaletteIcon}
          label="Shop colors"
          value={{
            swatches: [paintColor(form.primaryColor, t.primary[600]), paintColor(form.secondaryColor, t.warning[500])],
            text: ownColors ? 'Your own colors' : 'Emoorm colors',
          }}
        />
      </SettingsList>
    </SellerPage>
  );
}

/**
 * No shop yet: the website's one-page form ("Create Your Shop") with the
 * fields a new shop needs, then Create Store (POST /stores).
 */
function CreateStore({ form, setForm, onCreated }) {
  const insets = useSafeAreaInsets();
  const { setStore, refreshSetup } = useSellerShell();
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setForm((p) => ({ ...p, [key]: value }));

  const create = async () => {
    const problem = aboutProblem(form);
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    try {
      const res = await apiClient.post('/stores', form);
      setStore(res.data);
      refreshSetup();
      toast.success('Store created successfully!');
      onCreated();
    } catch (err) {
      toast.error(err.message || 'Failed to save store');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SellerPage scroll={false} privateLine={false}>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        style={styles.flex}
        contentContainerStyle={[sellerPageStyles.content, { paddingBottom: 24 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <SellerPrivateLine />
        <Text style={styles.title}>Create Your Shop</Text>
        <Text style={styles.subtitle}>Your public storefront details</Text>
        <View style={styles.card}>
          <Field label="Store Name" required>
            <FormInput value={form.name} onChangeText={set('name')} placeholder="e.g. Maria's Fresh Farm" />
          </Field>
          <Field label="Description">
            <FormInput
              multiline
              value={form.description}
              onChangeText={set('description')}
              placeholder="Tell buyers about your store and what you sell..."
              maxLength={DESCRIPTION_MAX}
            />
            <Text style={styles.count}>{form.description.length}/{DESCRIPTION_MAX}</Text>
          </Field>
          <Field label="Store / Pickup Address">
            <FormInput
              value={form.pickupAddress}
              onChangeText={set('pickupAddress')}
              placeholder="Street, Barangay, Municipality, Oriental Mindoro"
            />
          </Field>
          <Field label="Pin Store Location" Icon={MapPinIcon}>
            <LocationPicker
              value={{ latitude: form.latitude, longitude: form.longitude }}
              onChange={({ latitude, longitude }) => setForm((p) => ({ ...p, latitude, longitude }))}
              height={330}
            />
          </Field>
          <Field label="Contact Number">
            <FormInput value={form.contactNumber} onChangeText={set('contactNumber')} placeholder="09XXXXXXXXX" keyboardType="phone-pad" />
          </Field>
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={create}
            style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed, saving && styles.off]}
          >
            <FloppyDiskIcon size={16} color="#fff" />
            <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Create Store'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SellerPage>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  loading: { gap: 10, paddingVertical: 16, paddingHorizontal: 4 },
  title: { marginTop: 8, fontSize: 20, lineHeight: 26, color: t.neutral[900], ...font(500) },
  subtitle: { marginTop: 2, marginBottom: 12, fontSize: 13, lineHeight: 20.8, color: t.neutral[500], ...font(400) },
  card: { gap: 16, marginHorizontal: -12, padding: 16, backgroundColor: t.neutral[0] },
  count: { alignSelf: 'flex-end', fontSize: 12, lineHeight: 19.2, color: t.neutral[500], ...font(400) },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 46,
    borderRadius: 999,
    backgroundColor: t.primary[600],
  },
  primaryPressed: { backgroundColor: t.primary[700] },
  primaryText: { fontSize: 14, lineHeight: 20, color: t.onBrand, ...font(500) },
  off: { opacity: 0.6 },
}));
