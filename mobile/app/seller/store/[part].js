import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { MapPinIcon } from 'phosphor-react-native';
import apiClient from '../../../src/api/client';
import { uploadImage } from '../../../src/lib/upload';
import { fetchMunicipalities } from '../../../src/lib/referenceData';
import { toast } from '../../../src/lib/toast';
import { font, t } from '../../../src/theme';
import LoadingSkeleton from '../../../src/components/LoadingSkeleton';
import LocationPicker from '../../../src/components/maps/LocationPicker';
import OrderConfirmDialog from '../../../src/components/orders/OrderConfirmDialog';
import SellerPage, { SellerPrivateLine, sellerPageStyles } from '../../../src/components/seller/SellerPage';
import PhoneSaveBar, { savebarSpace } from '../../../src/components/seller/PhoneSaveBar';
import { useSellerShell } from '../../../src/components/seller/SellerShell';
import {
  ActiveToggle, ColorPicker, Field, FormInput, ImageUploader, OutlineButton, PickupAddressField, ThemePreview,
} from '../../../src/components/seller/store/StoreFields';
import {
  DEFAULT_PRIMARY, DEFAULT_SECONDARY, DESCRIPTION_MAX, PARTS, aboutProblem, partDirty, pickupGap, useStoreForm,
} from '../../../src/components/seller/store/storeLib';
import { PageLoader } from '../../../src/components/BrandLoader';

/*
 * /seller/store/:part on phones (web/src/pages/SellerStore.jsx, the phone
 * branch): one part of the shop profile on its own page (about = Name &
 * description, branding = Logo & banner, location = Location, colors = Shop
 * colors), with Cancel and Save changes at the bottom. It starts from the
 * saved profile and saves only its own fields (PUT /stores/:id), then goes
 * back to where it was opened from (the list, Me, Shop setup…).
 */
export default function SellerStorePartScreen() {
  const { part: rawPart } = useLocalSearchParams();
  const part = String(rawPart || '');
  if (!PARTS[part]) return <Redirect href="/seller/store" />;
  // Each part starts from the saved profile: nothing unsaved carries over.
  return <StorePart key={part} part={part} />;
}

function StorePart({ part }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setStore: setShellStore, refreshSetup } = useSellerShell();
  const {
    store, setStore, form, setForm, saved, setSaved, isLoading, isNew,
  } = useStoreForm();
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState(null);
  const [deactivateConfirm, setDeactivateConfirm] = useState(false);
  // The address as picked (town, barangay, street), once changed.
  const [pickupDraft, setPickupDraft] = useState(null);
  const [municipalities, setMunicipalities] = useState([]);

  useEffect(() => {
    if (part !== 'location') return undefined;
    let live = true;
    fetchMunicipalities().then((list) => { if (live) setMunicipalities(list || []); }).catch(() => {});
    return () => { live = false; };
  }, [part]);

  const dirty = partDirty(part, form, saved);
  const set = (key) => (value) => setForm((p) => ({ ...p, [key]: value }));

  // Back to where the part was opened from.
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/seller/store');
  };

  const handleUpload = async (field) => {
    if (uploadingField) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (result.canceled || !result.assets?.[0]) return;
    setUploadingField(field);
    try {
      const res = await uploadImage(result.assets[0]);
      setForm((p) => ({ ...p, [field]: res.url }));
      toast.success('Image uploaded');
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploadingField(null);
    }
  };

  const saveStore = async () => {
    setIsSaving(true);
    try {
      const changes = Object.fromEntries(PARTS[part].fields.map((f) => [f, form[f]]));
      const res = await apiClient.put(`/stores/${store.id}`, changes);
      setStore(res.data);
      setShellStore((prev) => ({ ...(prev || {}), ...(res.data || {}) }));
      refreshSetup();
      toast.success('Saved');
      setSaved(form);
      leave();
    } catch (err) {
      toast.error(err.message || 'Failed to save store');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (part === 'about') {
      const problem = aboutProblem(form);
      if (problem) {
        toast.error(problem);
        return;
      }
    }
    // Phones pick the address: the barangay and a street or landmark as well.
    const addressProblem = part === 'location' && pickupDraft ? pickupGap(pickupDraft) : null;
    if (addressProblem) {
      toast.error(addressProblem);
      return;
    }
    // Deactivating an active store hides it from all buyers: confirm first.
    if (part === 'about' && store?.isActive && !form.isActive) {
      setDeactivateConfirm(true);
      return;
    }
    await saveStore();
  };

  if (isNew) return <Redirect href="/seller/store" />;

  if (isLoading) {
    return (
      <SellerPage>
        <PageLoader label="Loading" />
      </SellerPage>
    );
  }

  const card = {
    about: (
      <View style={styles.form}>
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
        <Field label="Contact Number">
          <FormInput value={form.contactNumber} onChangeText={set('contactNumber')} placeholder="09XXXXXXXXX" keyboardType="phone-pad" />
        </Field>
        <ActiveToggle value={form.isActive} onChange={set('isActive')} />
      </View>
    ),
    branding: (
      <View style={styles.branding}>
        <ImageUploader
          title="Shop Logo"
          hint="Square image, at least 200×200px."
          value={form.logo}
          onPick={() => handleUpload('logo')}
          onRemove={() => setForm((p) => ({ ...p, logo: '' }))}
          uploading={uploadingField === 'logo'}
          shape="circle"
        />
        <View style={styles.divider} />
        <ImageUploader
          title="Cover Banner"
          hint="Wide image (recommended 1600×400px)."
          value={form.bannerImage || form.coverImage}
          onPick={() => handleUpload('bannerImage')}
          onRemove={() => setForm((p) => ({ ...p, bannerImage: '' }))}
          uploading={uploadingField === 'bannerImage'}
          shape="banner"
        />
      </View>
    ),
    location: (
      <View style={styles.form}>
        <Field label="Store / Pickup Address">
          <PickupAddressField
            value={form.pickupAddress}
            shopTown={store?.municipality?.name}
            municipalities={municipalities}
            onChange={(text, parts) => {
              setForm((p) => ({ ...p, pickupAddress: text }));
              setPickupDraft(parts);
            }}
          />
        </Field>
        <Field label="Pin Store Location" Icon={MapPinIcon}>
          <LocationPicker
            value={{ latitude: form.latitude, longitude: form.longitude }}
            onChange={({ latitude, longitude }) => setForm((p) => ({ ...p, latitude, longitude }))}
            height={330}
          />
        </Field>
      </View>
    ),
    colors: (
      <>
        <View style={styles.theme}>
          <ColorPicker
            label="Primary color"
            hint="Used for buttons, links, and highlights."
            value={form.primaryColor}
            onChange={set('primaryColor')}
          />
          <ColorPicker
            label="Accent color"
            hint="Used for secondary highlights and badges."
            value={form.secondaryColor}
            onChange={set('secondaryColor')}
          />
          <ThemePreview
            name={form.name || 'Your Store'}
            logo={form.logo}
            banner={form.bannerImage || form.coverImage}
            primary={form.primaryColor}
            secondary={form.secondaryColor}
          />
        </View>
        <View style={styles.actions}>
          <OutlineButton
            label="Reset to Emoorm colors"
            onPress={() => setForm((p) => ({ ...p, primaryColor: DEFAULT_PRIMARY, secondaryColor: DEFAULT_SECONDARY }))}
          />
        </View>
      </>
    ),
  }[part];

  return (
    <SellerPage scroll={false} privateLine={false}>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        style={styles.flex}
        contentContainerStyle={[sellerPageStyles.content, { paddingBottom: savebarSpace(insets) + 8 }]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <SellerPrivateLine />
        <View style={styles.card}>{card}</View>
      </ScrollView>
      <PhoneSaveBar
        onCancel={leave}
        onSave={handleSubmit}
        saving={isSaving}
        canSave={dirty && !uploadingField}
      />
      <OrderConfirmDialog
        open={deactivateConfirm}
        title="Deactivate your store?"
        message="Buyers won't see your store or any of your products while it's inactive. You can reactivate anytime from this page."
        confirmLabel="Deactivate & Save"
        danger
        loading={isSaving}
        onConfirm={() => { setDeactivateConfirm(false); saveStore(); }}
        onCancel={() => setDeactivateConfirm(false)}
      />
    </SellerPage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { gap: 10, paddingVertical: 16, paddingHorizontal: 4 },
  // .seller-card on phones: edge to edge, white; its header is hidden on a part's page.
  card: { marginHorizontal: -12, backgroundColor: t.neutral[0] },
  form: { gap: 16, padding: 16 },
  count: { alignSelf: 'flex-end', fontSize: 12, lineHeight: 19.2, color: t.neutral[500], ...font(400) },
  branding: { gap: 4, paddingVertical: 12, paddingHorizontal: 16 },
  divider: { height: 1, marginVertical: 6, backgroundColor: t.neutral[100] },
  theme: { gap: 12, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 16 },
  // .form-actions.branding-actions: a hairline above, the button full width.
  actions: {
    marginTop: 8, paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: 1, borderTopColor: t.neutral[100],
  },
});
