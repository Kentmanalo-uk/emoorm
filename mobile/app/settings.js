import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Trash2 } from 'lucide-react-native';
import ScreenHeader from '../src/components/ScreenHeader';
import TextField from '../src/components/TextField';
import Button from '../src/components/Button';
import apiClient from '../src/api/client';
import { ENDPOINTS } from '../src/api/endpoints';
import useAuthStore from '../src/store/authStore';
import { resolveImg } from '../src/lib/media';
import { uploadImage } from '../src/lib/upload';
import { toast } from '../src/lib/toast';
import { invalidateCachedData } from '../src/lib/dataCache';
import { colors, radius, spacing, typography } from '../src/theme';

const PASSWORD_RULE = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])/;

export default function Settings() {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const [form, setForm] = useState({ fullName: user?.fullName || '', contactNumber: user?.contactNumber || '', barangay: user?.barangay || '', address: user?.address || '', profilePhoto: user?.profilePhoto || '' });
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [changing, setChanging] = useState(false);

  const setField = (name, value) => setForm((current) => ({ ...current, [name]: value }));
  const choosePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return toast.error('Photo permission is required');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [1, 1] });
    if (result.canceled) return;
    setUploading(true);
    try { const uploaded = await uploadImage(result.assets[0]); setField('profilePhoto', uploaded.url); toast.success('Photo ready to save'); }
    catch (error) { toast.error('Upload failed', error.message); }
    finally { setUploading(false); }
  };
  const saveProfile = async () => {
    if (form.fullName.trim().length < 2) return toast.error('Enter your full name');
    if (form.contactNumber && !/^09\d{9}$/.test(form.contactNumber.replace(/\D/g, ''))) return toast.error('Use an 11-digit number starting with 09');
    setSaving(true);
    try {
      const response = await apiClient.put(ENDPOINTS.AUTH.PROFILE, { ...form, fullName: form.fullName.trim(), contactNumber: form.contactNumber.trim() || null });
      await updateUser({ ...user, ...response.data });
      invalidateCachedData('profile:');
      toast.success('Profile updated');
    } catch (error) { toast.error('Could not save profile', error.message); }
    finally { setSaving(false); }
  };
  const changePassword = async () => {
    if (!password.currentPassword || !password.newPassword || !password.confirmPassword) return toast.error('Complete all password fields');
    if (password.newPassword !== password.confirmPassword) return toast.error('New passwords do not match');
    if (password.newPassword.length < 8 || !PASSWORD_RULE.test(password.newPassword)) return toast.error('Use 8+ characters with uppercase, lowercase, number, and symbol');
    setChanging(true);
    try { await apiClient.post(ENDPOINTS.AUTH.CHANGE_PASSWORD, password); setPassword({ currentPassword: '', newPassword: '', confirmPassword: '' }); toast.success('Password changed'); }
    catch (error) { toast.error('Could not change password', error.message); }
    finally { setChanging(false); }
  };

  return <View style={styles.screen}><ScreenHeader title="Account Settings" /><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.section}><Text style={styles.sectionTitle}>Profile Information</Text><View style={styles.photoRow}>{form.profilePhoto ? <Image source={{ uri: resolveImg(form.profilePhoto) }} style={styles.photo} /> : <View style={[styles.photo, styles.photoFallback]}><Text style={styles.initial}>{form.fullName.charAt(0).toUpperCase() || 'U'}</Text></View>}<View style={styles.photoActions}><Pressable style={styles.photoButton} onPress={choosePhoto} disabled={uploading}>{uploading ? <ActivityIndicator color={colors.secondary} /> : <><Camera size={16} color={colors.secondary} /><Text style={styles.photoButtonText}>Change photo</Text></>}</Pressable>{form.profilePhoto ? <Pressable style={styles.removePhoto} onPress={() => setField('profilePhoto', '')}><Trash2 size={15} color={colors.error} /><Text style={styles.removeText}>Remove</Text></Pressable> : null}</View></View>
      <TextField label="Full name" value={form.fullName} onChangeText={(value) => setField('fullName', value)} autoCapitalize="words" /><TextField label="Email" value={user?.email || ''} editable={false} /><TextField label="Contact number" value={form.contactNumber} onChangeText={(value) => setField('contactNumber', value)} keyboardType="phone-pad" /><TextField label="Barangay" value={form.barangay} onChangeText={(value) => setField('barangay', value)} autoCapitalize="words" /><TextField label="Delivery address" value={form.address} onChangeText={(value) => setField('address', value)} autoCapitalize="words" multiline />
      <Button title="Save Profile" onPress={saveProfile} loading={saving} />
    </View>
    <View style={styles.section}><Text style={styles.sectionTitle}>Change Password</Text><TextField label="Current password" value={password.currentPassword} onChangeText={(value) => setPassword((current) => ({ ...current, currentPassword: value }))} secureTextEntry /><TextField label="New password" value={password.newPassword} onChangeText={(value) => setPassword((current) => ({ ...current, newPassword: value }))} secureTextEntry /><TextField label="Confirm new password" value={password.confirmPassword} onChangeText={(value) => setPassword((current) => ({ ...current, confirmPassword: value }))} secureTextEntry /><Button title="Change Password" variant="secondary" onPress={changePassword} loading={changing} /></View>
  </ScrollView></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgSecondary }, content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl }, section: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.white }, sectionTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.lg }, photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }, photo: { width: 76, height: 76, borderRadius: radius.full }, photoFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }, initial: { ...typography.h1, color: colors.white }, photoActions: { gap: spacing.sm }, photoButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.base, backgroundColor: colors.bgGreenLight }, photoButtonText: { ...typography.caption, color: colors.secondary }, removePhoto: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, removeText: { ...typography.caption, color: colors.error },
});
