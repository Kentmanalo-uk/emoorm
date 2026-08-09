import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, MapPin } from 'lucide-react-native';
import ScreenHeader from '../src/components/ScreenHeader';
import TextField from '../src/components/TextField';
import Button from '../src/components/Button';
import apiClient from '../src/api/client';
import { ENDPOINTS } from '../src/api/endpoints';
import useAuthStore from '../src/store/authStore';
import { toast } from '../src/lib/toast';
import { invalidateCachedData } from '../src/lib/dataCache';
import { colors, radius, spacing, typography } from '../src/theme';

export default function Addresses() {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const [profile, setProfile] = useState(user || {});
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => { apiClient.get(ENDPOINTS.AUTH.PROFILE).then((response) => setProfile(response.data)).catch((error) => toast.error('Failed to load address', error.message)).finally(() => setLoading(false)); }, []);
  const setField = (name, value) => { setProfile((current) => ({ ...current, [name]: value })); setErrors((current) => ({ ...current, [name]: '' })); };
  const save = async () => {
    const next = {};
    if (!profile.address?.trim()) next.address = 'Street or house address is required.';
    if (!profile.barangay?.trim()) next.barangay = 'Barangay is required.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      const response = await apiClient.put(ENDPOINTS.AUTH.PROFILE, { address: profile.address.trim(), barangay: profile.barangay.trim() });
      await updateUser({ ...user, ...response.data });
      invalidateCachedData('profile:');
      setProfile(response.data);
      setEditing(false);
      toast.success('Delivery address updated');
    } catch (error) { toast.error('Could not update address', error.message); }
    finally { setSaving(false); }
  };

  if (loading) return <View style={styles.screen}><ScreenHeader title="My Address" /><View style={styles.center}><ActivityIndicator color={colors.primary} /></View></View>;
  return <View style={styles.screen}><ScreenHeader title="My Address" subtitle="Default checkout address" /><ScrollView contentContainerStyle={styles.content}>
    {!editing ? <View style={styles.card}><View style={styles.badge}><Check size={13} color={colors.secondary} /><Text style={styles.badgeText}>Default</Text></View><Text style={styles.name}>{profile.fullName}</Text><Text style={styles.phone}>{profile.contactNumber || 'No contact number'}</Text><View style={styles.location}><MapPin size={18} color={colors.secondary} /><View style={styles.locationText}><Text style={styles.address}>{profile.address || 'No street address set'}</Text><Text style={styles.address}>{profile.barangay || 'No barangay set'}</Text><Text style={styles.municipality}>{profile.municipality?.name || user?.municipality?.name || 'Oriental Mindoro'}</Text></View></View><Pressable style={styles.editButton} onPress={() => setEditing(true)}><Text style={styles.editText}>Edit address</Text></Pressable></View>
      : <View style={styles.form}><Text style={styles.formTitle}>Edit delivery address</Text><TextField label="Street / House No." value={profile.address || ''} onChangeText={(value) => setField('address', value)} autoCapitalize="words" placeholder="123 Rizal Street" error={errors.address} /><TextField label="Barangay" value={profile.barangay || ''} onChangeText={(value) => setField('barangay', value)} autoCapitalize="words" placeholder="Barangay Poblacion" error={errors.barangay} /><View style={styles.locked}><Text style={styles.lockedLabel}>Municipality</Text><Text style={styles.lockedValue}>{profile.municipality?.name || user?.municipality?.name || 'Oriental Mindoro'}</Text><Text style={styles.hint}>Municipality changes require support verification.</Text></View><View style={styles.formActions}><Button title="Cancel" variant="ghost" onPress={() => setEditing(false)} style={styles.flex} /><Button title="Save Address" onPress={save} loading={saving} style={styles.flex} /></View></View>}
  </ScrollView></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgSecondary }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, content: { padding: spacing.lg }, card: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.white, gap: spacing.sm }, badge: { alignSelf: 'flex-start', flexDirection: 'row', gap: spacing.xs, alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.bgGreenLight }, badgeText: { ...typography.caption, color: colors.secondary }, name: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.sm }, phone: { ...typography.body, color: colors.textSecondary }, location: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }, locationText: { flex: 1, gap: 3 }, address: { ...typography.body, color: colors.textPrimary }, municipality: { ...typography.caption, color: colors.textSecondary }, editButton: { height: 44, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.lg }, editText: { ...typography.body, color: colors.secondary }, form: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.white }, formTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.lg }, locked: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.gray50, marginBottom: spacing.lg }, lockedLabel: { ...typography.caption, color: colors.textMuted }, lockedValue: { ...typography.body, color: colors.textPrimary, marginTop: 3 }, hint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs }, formActions: { flexDirection: 'row', gap: spacing.sm }, flex: { flex: 1 },
});
