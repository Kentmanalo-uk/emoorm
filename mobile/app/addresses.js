import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  CheckIcon, InfoIcon, MapPinIcon, PencilSimpleIcon, PlusIcon, SparkleIcon, TrashIcon, WarningCircleIcon,
} from 'phosphor-react-native';
import apiClient from '../src/api/client';
import ScreenHeader from '../src/components/ScreenHeader';
import EmptyState from '../src/components/EmptyState';
import LoadingSkeleton from '../src/components/LoadingSkeleton';
import CartConfirmDialog from '../src/components/cart/CartConfirmDialog';
import { toast } from '../src/lib/toast';
import { fetchMunicipalities } from '../src/lib/referenceData';
import useAuthStore from '../src/store/authStore';
import ProfileAddressPicker, { normalizeName } from '../src/components/profile/ProfileAddressPicker';
import { addressFromPin } from '../src/lib/pinAddress';
import LocationPicker from '../src/components/maps/LocationPicker';
import { useFreshAccount } from '../src/components/profile/SettingsParts';
import { font, t } from '../src/theme';
import { PageLoader } from '../src/components/BrandLoader';

const emptyForm = {
  label: '',
  fullName: '',
  contactNumber: '',
  province: 'Oriental Mindoro',
  provinceCode: '',
  municipalityId: '',
  municipalityName: '',
  municipalityCode: '',
  barangay: '',
  barangayCode: '',
  street: '',
  // The pin for the rider: every address has one.
  latitude: null,
  longitude: null,
};

/**
 * The buyer's saved delivery addresses (web/src/pages/Addresses.jsx): add,
 * edit, delete and set the default, through /addresses.
 */
export default function Addresses() {
  const user = useAuthStore((s) => s.user);
  // A new address starts from the account's (as saved now).
  useFreshAccount();
  const [municipalities, setMunicipalities] = useState([]);
  const [muniLoading, setMuniLoading] = useState(true);
  const [addresses, setAddresses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  // What the last pin filled in: { tone: 'busy' | 'ok' | 'partial' | 'outside' | 'off', text }.
  const [pinNote, setPinNote] = useState(null);
  const pinAsk = useRef(0);
  const autoStreet = useRef('');

  const loadAddresses = async () => {
    const res = await apiClient.get('/addresses');
    setAddresses(res.data || []);
  };

  useEffect(() => {
    fetchMunicipalities().then(setMunicipalities).catch(() => {}).finally(() => setMuniLoading(false));
  }, []);

  useFocusEffect(useCallback(() => {
    let live = true;
    loadAddresses()
      .catch(() => { if (live) toast.error('Failed to load address data'); })
      .finally(() => { if (live) setIsLoading(false); });
    return () => { live = false; };
  }, []));

  const setField = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) setFormErrors((prev) => ({ ...prev, [name]: '' }));
  };

  // A pin (tapped, dragged or the phone's location) fills the town, barangay
  // and street from the spot. A street the person typed is kept; one the pin
  // wrote is replaced by the next pin's.
  const fillFromPin = async (pin) => {
    const ask = ++pinAsk.current;
    setPinNote({ tone: 'busy', text: 'Finding the address at the pin…' });
    let found;
    try {
      found = await addressFromPin(pin);
    } catch {
      if (ask === pinAsk.current) setPinNote({ tone: 'off', text: 'Pinned. We couldn’t look up the address here — fill it in below.' });
      return;
    }
    if (ask !== pinAsk.current) return;
    if (found.outside) {
      setPinNote({ tone: 'outside', text: 'This spot is outside Oriental Mindoro. E‑MOORM delivers in Oriental Mindoro only.' });
      return;
    }
    const db = found.municipalityName
      ? municipalities.find((m) => normalizeName(m.name) === normalizeName(found.municipalityName))
      : null;
    setFormData((prev) => {
      const next = { ...prev };
      if (found.municipalityName) {
        Object.assign(next, { municipalityName: found.municipalityName, municipalityCode: found.municipalityCode, municipalityId: db?.id || '' });
        // A new town: the old barangay can't stay.
        if (normalizeName(prev.municipalityName) !== normalizeName(found.municipalityName)) Object.assign(next, { barangay: '', barangayCode: '' });
      }
      if (found.barangay) Object.assign(next, { barangay: found.barangay, barangayCode: found.barangayCode });
      if (found.street && (!prev.street.trim() || prev.street === autoStreet.current)) {
        next.street = found.street;
        autoStreet.current = found.street;
      }
      return next;
    });
    setFormErrors((prev) => ({ ...prev, municipalityId: found.municipalityName ? '' : prev.municipalityId, barangay: found.barangay ? '' : prev.barangay }));
    const place = [found.barangay, found.municipalityName].filter(Boolean).join(', ');
    if (found.municipalityName && found.barangay) {
      setPinNote({ tone: 'ok', text: `Filled in from the pin: ${place}. Check the street and house number.` });
    } else if (found.municipalityName) {
      setPinNote({ tone: 'partial', text: `Filled in ${found.municipalityName} from the pin. Pick the barangay below.` });
    } else {
      setPinNote({ tone: 'partial', text: 'Pinned. We couldn’t tell the town here — pick it below.' });
    }
  };

  const validate = () => {
    const errs = {};
    if (!formData.fullName.trim()) errs.fullName = 'Recipient name is required.';
    if (!formData.contactNumber.trim()) errs.contactNumber = 'Contact number is required.';
    if (!formData.province) errs.province = 'Province is required.';
    if (!formData.municipalityId) errs.municipalityId = 'City / Municipality is required.';
    if (!formData.barangay.trim()) errs.barangay = 'Barangay is required.';
    if (!formData.street.trim()) errs.street = 'Street / house address is required.';
    if (formData.latitude == null || formData.longitude == null) errs.pin = 'Pin the house on the map so the rider can find it.';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const openAddForm = () => {
    setEditingId(null);
    // The first address starts from the account's own address.
    const fromProfile = addresses.length === 0 && user?.municipalityId;
    setFormData({
      ...emptyForm,
      fullName: user?.fullName || '',
      contactNumber: user?.contactNumber || '',
      ...(fromProfile ? {
        label: 'Home',
        municipalityId: user.municipalityId,
        municipalityName: user.municipality?.name || '',
        barangay: user.barangay || '',
        street: user.address || '',
      } : {}),
    });
    setFormErrors({});
    setPinNote(null);
    autoStreet.current = '';
    setFormOpen(true);
  };

  // The picker finds the saved town and barangay on its lists by name.
  const openEditForm = (addr) => {
    setEditingId(addr.id);
    setFormData({
      label: addr.label || '',
      fullName: addr.fullName || '',
      contactNumber: addr.contactNumber || '',
      province: addr.province || 'Oriental Mindoro',
      provinceCode: '',
      municipalityId: addr.municipalityId || '',
      municipalityName: addr.municipality?.name || '',
      municipalityCode: '',
      barangay: addr.barangay || '',
      barangayCode: '',
      street: addr.street || '',
      latitude: addr.latitude ?? null,
      longitude: addr.longitude ?? null,
    });
    setFormErrors({});
    setPinNote(null);
    autoStreet.current = '';
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setFormData(emptyForm);
    setFormErrors({});
  };

  const handleSave = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      if (editingId) {
        await apiClient.put(`/addresses/${editingId}`, formData);
        toast.success('Address updated');
      } else {
        await apiClient.post('/addresses', formData);
        toast.success('Address added');
      }
      await loadAddresses();
      closeForm();
    } catch (err) {
      toast.error(err.message || 'Failed to save address');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetDefault = async (addr) => {
    if (addr.isDefault) return;
    setBusyId(addr.id);
    try {
      await apiClient.put(`/addresses/${addr.id}/default`);
      await loadAddresses();
      toast.success('Default address updated');
    } catch (err) {
      toast.error(err.message || 'Failed to set default');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    const addr = deleting;
    setDeleting(null);
    if (!addr) return;
    setBusyId(addr.id);
    try {
      await apiClient.delete(`/addresses/${addr.id}`);
      await loadAddresses();
      toast.success('Address deleted');
    } catch (err) {
      toast.error(err.message || 'Failed to delete address');
    } finally {
      setBusyId(null);
    }
  };

  let body;
  if (isLoading) {
    body = (
      <PageLoader label="Loading addresses" />
    );
  } else if (formOpen) {
    body = (
      <View style={[styles.card, styles.form]}>
        <FormField label="Label (optional)">
          <FormInput value={formData.label} onChangeText={(v) => setField('label', v)} placeholder="Home, Work, etc." />
        </FormField>
        <FormField label="Recipient Name" error={formErrors.fullName}>
          <FormInput value={formData.fullName} onChangeText={(v) => setField('fullName', v)} placeholder="Juan Dela Cruz" error={formErrors.fullName} />
        </FormField>
        <FormField label="Contact Number" error={formErrors.contactNumber}>
          <FormInput value={formData.contactNumber} onChangeText={(v) => setField('contactNumber', v)} placeholder="09XXXXXXXXX" keyboardType="phone-pad" error={formErrors.contactNumber} />
        </FormField>

        <View style={styles.pinGroup}>
          <Text style={styles.formLabel}>Pin the house on the map</Text>
          <Text style={styles.pinHelp}>Tap where the house is, or use your location. We fill in the address from the pin, and the rider follows it to your door.</Text>
          <LocationPicker
            value={{ latitude: formData.latitude, longitude: formData.longitude }}
            onChange={({ latitude, longitude }) => {
              setFormData((prev) => ({ ...prev, latitude, longitude }));
              if (formErrors.pin) setFormErrors((prev) => ({ ...prev, pin: '' }));
              fillFromPin({ latitude, longitude });
            }}
            height={260}
            lockToPhilippines
            hint="Tap the map where the house is."
            error={Boolean(formErrors.pin)}
          />
          {formErrors.pin ? <Text style={styles.formError}>{formErrors.pin}</Text> : null}
          {pinNote ? <PinNote note={pinNote} /> : null}
        </View>

        <ProfileAddressPicker
          value={formData}
          // The picker hands back the whole value it last saw; the pin is not its to change.
          onChange={(next) => setFormData((prev) => ({ ...prev, ...next, latitude: prev.latitude, longitude: prev.longitude }))}
          dbMunicipalities={municipalities}
          dbLoading={muniLoading}
          errors={formErrors}
        />

        <View style={styles.formActions}>
          <Pressable accessibilityRole="button" onPress={closeForm} style={[styles.formBtn, styles.formCancel]}>
            <Text style={[styles.formBtnText, { color: t.neutral[700] }]}>Cancel</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={handleSave} disabled={isSubmitting} style={[styles.formBtn, styles.formSubmit, isSubmitting && { opacity: 0.6 }]}>
            {isSubmitting ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} /> : null}
            <Text style={[styles.formBtnText, { color: '#fff' }]}>{isSubmitting ? 'Saving…' : editingId ? 'Save Changes' : 'Add Address'}</Text>
          </Pressable>
        </View>
      </View>
    );
  } else {
    body = (
      <>
        <Pressable accessibilityRole="button" onPress={openAddForm} style={({ pressed }) => [styles.addBtn, pressed && { backgroundColor: t.primary[700] }]}>
          <PlusIcon size={16} color="#fff" />
          <Text style={styles.addText}>Add new address</Text>
        </Pressable>
        {addresses.length === 0 ? (
          <EmptyState
            page
            art="addresses"
            title="You have no saved addresses yet."
            actions={[{ label: 'Add your first address', onPress: openAddForm, icon: PlusIcon, variant: 'outline' }]}
          />
        ) : (
          <View style={styles.list}>
            {addresses.map((addr) => (
              <View key={addr.id} style={styles.card}>
                {addr.isDefault ? (
                  <View style={styles.defaultBadge}>
                    <CheckIcon size={14} color={t.primary[600]} />
                    <Text style={styles.defaultText}>Default</Text>
                  </View>
                ) : null}
                <View style={styles.cardBody}>
                  {addr.label ? <Text style={styles.labelTag}>{addr.label}</Text> : null}
                  <Text style={styles.name}>{addr.fullName}</Text>
                  <Text style={styles.phone}>{addr.contactNumber || '—'}</Text>
                  <View style={styles.location}>
                    <MapPinIcon size={16} color={t.neutral[500]} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.locationLine}>{addr.street || '—'}</Text>
                      <Text style={styles.locationLine}>{addr.barangay || '—'}</Text>
                      {addr.latitude != null ? (
                        <View style={styles.pinned}>
                          <MapPinIcon size={13} weight="fill" color={t.primary[700]} />
                          <Text style={styles.pinnedText}>Pinned on the map</Text>
                        </View>
                      ) : (
                        <View style={styles.unpinned}>
                          <MapPinIcon size={13} color={t.accent[600]} />
                          <Text style={styles.unpinnedText}>Not pinned yet: edit to pin it on the map</Text>
                        </View>
                      )}
                      <Text style={styles.locationLine}>{addr.municipality?.name || '—'}, {addr.province || 'Oriental Mindoro'}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.actions}>
                  {!addr.isDefault ? (
                    <ActionButton label="Set as default" onPress={() => handleSetDefault(addr)} disabled={busyId === addr.id} />
                  ) : null}
                  <ActionButton label="Edit" Icon={PencilSimpleIcon} onPress={() => openEditForm(addr)} />
                  <ActionButton label="Delete" Icon={TrashIcon} onPress={() => setDeleting(addr)} disabled={busyId === addr.id} />
                </View>
              </View>
            ))}
          </View>
        )}
      </>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="My Addresses" backTo="/profile" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={[styles.content, formOpen && { paddingTop: 24 }, !isLoading && !formOpen && addresses.length === 0 && styles.grow]} keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      </KeyboardAvoidingView>
      <CartConfirmDialog
        open={Boolean(deleting)}
        title="Delete this address?"
        message="This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </View>
  );
}

function ActionButton({ label, Icon, onPress, disabled }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.actionBtn, { flex: 1 }, disabled && { opacity: 0.6 }, pressed && { borderColor: t.primary[600] }]}>
      {Icon ? <Icon size={14} color={t.neutral[700]} /> : null}
      <Text style={styles.actionText} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function FormField({ label, error, children }) {
  return (
    <View style={styles.formGroup}>
      <Text style={styles.formLabel}>{label}</Text>
      {children}
      {error ? <Text style={styles.formError}>{error}</Text> : null}
    </View>
  );
}

function FormInput({ error, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={t.neutral[500]}
      {...props}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.formInput, focused && { borderColor: t.primary[600] }, error && { borderColor: t.danger[500] }]}
    />
  );
}

/** What the pin filled in (or why it couldn't), under the map. */
function PinNote({ note }) {
  const look = {
    busy: [null, t.neutral[600], t.neutral[100]],
    ok: [SparkleIcon, t.primary[800], t.primary[50]],
    partial: [InfoIcon, t.warning[800], t.warning[50]],
    off: [InfoIcon, t.neutral[700], t.neutral[100]],
    outside: [WarningCircleIcon, t.danger[700], t.danger[50]],
  }[note.tone] || [InfoIcon, t.neutral[700], t.neutral[100]];
  const [Icon, color, bg] = look;
  return (
    <View style={[styles.pinNote, { backgroundColor: bg }]} accessibilityLiveRegion="polite">
      {Icon ? <Icon size={16} weight="fill" color={color} /> : <ActivityIndicator size="small" color={color} />}
      <Text style={[styles.pinNoteText, { color }]}>{note.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  content: { gap: 12, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 24 },

  addBtn: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14,
    borderRadius: 999, backgroundColor: t.primary[600],
  },
  addText: { fontSize: 13, lineHeight: 15.6, color: '#fff', ...font(500) },

  grow: { flexGrow: 1 },

  list: { gap: 12 },
  card: {
    padding: 14, borderRadius: 12, backgroundColor: t.neutral[0],
    boxShadow: '0px 1px 2px rgba(15, 23, 42, 0.04)',
  },
  defaultBadge: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10,
    paddingVertical: 3, paddingHorizontal: 10, borderRadius: 999, backgroundColor: t.success[100],
  },
  defaultText: { fontSize: 12, lineHeight: 19.2, color: t.primary[600], ...font(500) },
  cardBody: { gap: 4, marginBottom: 12, minWidth: 0 },
  labelTag: {
    alignSelf: 'flex-start', marginBottom: 4, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, overflow: 'hidden',
    backgroundColor: t.neutral[100], color: t.neutral[700], fontSize: 11, lineHeight: 17.6, ...font(500),
  },
  name: { fontSize: 16, lineHeight: 18.4, color: t.neutral[900], ...font(500) },
  phone: { fontSize: 13, lineHeight: 20.8, color: t.neutral[500], ...font(400) },
  location: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8 },
  locationLine: { fontSize: 14, lineHeight: 21, color: t.neutral[700], ...font(400) },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pinnedText: { fontSize: 12.5, lineHeight: 18.75, color: t.primary[700], ...font(400) },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.neutral[100] },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 0, minHeight: 42, paddingHorizontal: 10,
    borderWidth: 1, borderColor: t.neutral[300], borderRadius: 10, backgroundColor: '#fff',
  },
  actionText: { fontSize: 13, lineHeight: 15.6, color: t.neutral[700], ...font(500) },

  form: { gap: 14 },
  formGroup: { gap: 6 },
  formLabel: { fontSize: 12.5, lineHeight: 20, color: t.neutral[700], ...font(600) },
  formInput: {
    minHeight: 46, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 10,
    backgroundColor: '#fff', color: t.neutral[900], fontSize: 16, lineHeight: 24, ...font(400),
  },
  formError: { fontSize: 12, lineHeight: 18, color: t.danger[500], ...font(400) },
  pinGroup: { gap: 6 },
  pinHelp: { marginBottom: 8, fontSize: 13, lineHeight: 20.8, color: t.neutral[500], ...font(400) },
  pinNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12 },
  pinNoteText: { flex: 1, fontSize: 13, lineHeight: 18.5, ...font(500) },
  // An address saved before pins were required (.address-unpinned; the card's
  // `.address-location p { margin: 0 }` wins over its own 4px top margin).
  unpinned: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  unpinnedText: { flexShrink: 1, fontSize: 12.5, lineHeight: 18.75, color: t.accent[600], ...font(400) },
  formActions: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  formBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 46, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
  formCancel: { borderWidth: 1, borderColor: t.neutral[300], backgroundColor: '#fff' },
  formSubmit: { backgroundColor: t.primary[600] },
  formBtnText: { fontSize: 14, lineHeight: 16.8, ...font(500) },
});
