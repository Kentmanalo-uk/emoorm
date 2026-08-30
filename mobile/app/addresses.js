import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  CheckIcon as Check,
  MapPinIcon as MapPin,
  PlusIcon as Plus,
  PencilSimpleIcon as Edit,
  TrashIcon as Trash2,
  StarIcon as Star,
} from 'phosphor-react-native';
import ScreenHeader from '../src/components/ScreenHeader';
import TextField from '../src/components/TextField';
import Select from '../src/components/Select';
import Button from '../src/components/Button';
import EmptyState from '../src/components/EmptyState';
import apiClient from '../src/api/client';
import { ENDPOINTS } from '../src/api/endpoints';
import useAuthStore from '../src/store/authStore';
import { toast } from '../src/lib/toast';
import { colors, radius, spacing, typography } from '../src/theme';

const emptyForm = { label: '', fullName: '', contactNumber: '', street: '', barangay: '', municipalityId: '' };

export default function Addresses() {
  const user = useAuthStore((state) => state.user);
  const [addresses, setAddresses] = useState([]);
  const [municipalities, setMunicipalities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const loadAddresses = async () => {
    const response = await apiClient.get(ENDPOINTS.ADDRESSES.LIST);
    setAddresses(response.data || []);
  };

  useEffect(() => {
    Promise.all([loadAddresses(), apiClient.get(ENDPOINTS.MUNICIPALITIES).then((res) => setMunicipalities(res.data || []))])
      .catch((error) => toast.error('Failed to load addresses', error.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setField = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }));
    if (errors[name]) setErrors((current) => ({ ...current, [name]: '' }));
  };

  const validate = () => {
    const next = {};
    if (!form.fullName.trim()) next.fullName = 'Recipient name is required.';
    if (!form.contactNumber.trim()) next.contactNumber = 'Contact number is required.';
    if (!form.street.trim()) next.street = 'Street / house address is required.';
    if (!form.barangay.trim()) next.barangay = 'Barangay is required.';
    if (!form.municipalityId) next.municipalityId = 'Municipality is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const openAddForm = () => {
    setEditingId(null);
    setForm({ ...emptyForm, fullName: user?.fullName || '', contactNumber: user?.contactNumber || '' });
    setErrors({});
    setFormOpen(true);
  };

  const openEditForm = (addr) => {
    setEditingId(addr.id);
    setForm({
      label: addr.label || '',
      fullName: addr.fullName || '',
      contactNumber: addr.contactNumber || '',
      street: addr.street || '',
      barangay: addr.barangay || '',
      municipalityId: addr.municipalityId || '',
    });
    setErrors({});
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setErrors({});
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (editingId) {
        await apiClient.put(ENDPOINTS.ADDRESSES.UPDATE(editingId), form);
        toast.success('Address updated');
      } else {
        await apiClient.post(ENDPOINTS.ADDRESSES.CREATE, form);
        toast.success('Address added');
      }
      await loadAddresses();
      closeForm();
    } catch (error) {
      toast.error('Could not save address', error.message);
    } finally {
      setSaving(false);
    }
  };

  const setDefault = async (addr) => {
    if (addr.isDefault) return;
    setBusyId(addr.id);
    try {
      await apiClient.put(ENDPOINTS.ADDRESSES.SET_DEFAULT(addr.id));
      await loadAddresses();
      toast.success('Default address updated');
    } catch (error) {
      toast.error('Could not set default', error.message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = (addr) => {
    Alert.alert('Delete address?', 'This cannot be undone.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusyId(addr.id);
          try {
            await apiClient.delete(ENDPOINTS.ADDRESSES.DELETE(addr.id));
            await loadAddresses();
            toast.success('Address deleted');
          } catch (error) {
            toast.error('Could not delete address', error.message);
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="My Addresses" />
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="My Addresses"
        subtitle="Manage your saved delivery addresses"
        action={!formOpen ? <Pressable onPress={openAddForm} hitSlop={8}><Plus size={22} color={colors.primary} /></Pressable> : null}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {!formOpen && addresses.length === 0 && (
          <EmptyState
            icon={<MapPin size={44} color={colors.gray400} />}
            title="No saved addresses"
            message="Add a delivery address to speed up checkout."
            actionLabel="Add address"
            onAction={openAddForm}
          />
        )}

        {!formOpen && addresses.map((addr) => (
          <View key={addr.id} style={styles.card}>
            {addr.isDefault && <View style={styles.badge}><Check size={13} color={colors.secondary} /><Text style={styles.badgeText}>Default</Text></View>}
            {addr.label ? <Text style={styles.labelTag}>{addr.label}</Text> : null}
            <Text style={styles.name}>{addr.fullName}</Text>
            <Text style={styles.phone}>{addr.contactNumber || 'No contact number'}</Text>
            <View style={styles.location}>
              <MapPin size={18} color={colors.secondary} />
              <View style={styles.locationText}>
                <Text style={styles.address}>{addr.street}</Text>
                <Text style={styles.address}>{addr.barangay}</Text>
                <Text style={styles.municipality}>{addr.municipality?.name || '—'}, Oriental Mindoro</Text>
              </View>
            </View>
            <View style={styles.actions}>
              {!addr.isDefault && (
                <Pressable style={styles.actionButton} onPress={() => setDefault(addr)} disabled={busyId === addr.id}>
                  <Star size={15} color={colors.textSecondary} /><Text style={styles.actionText}>Set default</Text>
                </Pressable>
              )}
              <Pressable style={styles.actionButton} onPress={() => openEditForm(addr)}>
                <Edit size={15} color={colors.textSecondary} /><Text style={styles.actionText}>Edit</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => remove(addr)} disabled={busyId === addr.id}>
                <Trash2 size={15} color={colors.error} /><Text style={[styles.actionText, styles.dangerText]}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ))}

        {formOpen && (
          <View style={styles.form}>
            <Text style={styles.formTitle}>{editingId ? 'Edit address' : 'Add new address'}</Text>
            <TextField label="Label (optional)" value={form.label} onChangeText={(value) => setField('label', value)} placeholder="Home, Work, etc." autoCapitalize="words" />
            <TextField label="Recipient Name" value={form.fullName} onChangeText={(value) => setField('fullName', value)} placeholder="Juan Dela Cruz" autoCapitalize="words" error={errors.fullName} />
            <TextField label="Contact Number" value={form.contactNumber} onChangeText={(value) => setField('contactNumber', value)} placeholder="09XXXXXXXXX" keyboardType="phone-pad" error={errors.contactNumber} />
            <TextField label="Street / House No." value={form.street} onChangeText={(value) => setField('street', value)} placeholder="123 Rizal Street" autoCapitalize="words" error={errors.street} />
            <TextField label="Barangay" value={form.barangay} onChangeText={(value) => setField('barangay', value)} placeholder="Barangay Poblacion" autoCapitalize="words" error={errors.barangay} />
            <Select
              label="Municipality"
              value={form.municipalityId}
              options={municipalities.map((m) => ({ label: m.name, value: m.id }))}
              onChange={(value) => setField('municipalityId', value)}
              placeholder="Select municipality"
              error={errors.municipalityId}
            />
            <View style={styles.formActions}>
              <Button title="Cancel" variant="ghost" onPress={closeForm} style={styles.flex} />
              <Button title={editingId ? 'Save Changes' : 'Add Address'} onPress={save} loading={saving} style={styles.flex} />
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.md },
  card: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.white, gap: spacing.sm },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', gap: spacing.xs, alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.bgGreenLight },
  badgeText: { ...typography.caption, color: colors.secondary },
  labelTag: { alignSelf: 'flex-start', ...typography.caption, fontWeight: '600', color: colors.textSecondary, backgroundColor: colors.gray100, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.base },
  name: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.xs },
  phone: { ...typography.body, color: colors.textSecondary },
  location: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  locationText: { flex: 1, gap: 3 },
  address: { ...typography.body, color: colors.textPrimary },
  municipality: { ...typography.caption, color: colors.textSecondary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderLight },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.borderLight, borderRadius: radius.base },
  actionText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  dangerText: { color: colors.error },
  form: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.white, gap: spacing.md },
  formTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.sm },
  formActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  flex: { flex: 1 },
});
