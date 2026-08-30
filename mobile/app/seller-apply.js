import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CheckCircleIcon as CheckCircle2, IdentificationCardIcon as IdCard, StorefrontIcon as Store, UploadSimpleIcon as Upload } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import ScreenHeader from '../src/components/ScreenHeader';
import TextField from '../src/components/TextField';
import Select from '../src/components/Select';
import Button from '../src/components/Button';
import apiClient from '../src/api/client';
import { ENDPOINTS } from '../src/api/endpoints';
import useAuthStore from '../src/store/authStore';
import { uploadKycDocument } from '../src/lib/upload';
import { toast } from '../src/lib/toast';
import { colors, radius, spacing, typography } from '../src/theme';

const ID_TYPES = ['PhilSys National ID', 'Passport', 'Driver License (LTO)', 'PRC Professional ID', 'SSS / GSIS ID', 'UMID', 'Voter ID', 'Postal ID', 'PhilHealth ID', 'Barangay ID'];

export default function SellerApply() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const [form, setForm] = useState({ shopName: '', shopDescription: '', shopAddress: user?.address || '', idType: '', idFrontUrl: '', idBackUrl: '', selfieUrl: '' });
  // Local-only preview URIs (device file:// paths) for the ID photos — never sent to the server.
  const [previews, setPreviews] = useState({ idFrontUrl: '', idBackUrl: '', selfieUrl: '' });
  const [uploading, setUploading] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user?.role === 'SELLER') {
    return <View style={styles.screen}><ScreenHeader title="Seller Application" /><View style={styles.status}><CheckCircle2 size={52} color={colors.primary} /><Text style={styles.statusTitle}>Seller account enabled</Text><Text style={styles.statusText}>Open Seller Center to manage your store and inventory.</Text><Button title="Open Seller Center" onPress={() => router.replace('/seller')} style={styles.statusButton} /></View></View>;
  }
  if (user?.sellerApplicationStatus === 'PENDING') {
    return <View style={styles.screen}><ScreenHeader title="Seller Application" /><View style={styles.status}><CheckCircle2 size={52} color={colors.warning} /><Text style={styles.statusTitle}>Application under review</Text><Text style={styles.statusText}>Your storefront stays private until an administrator completes verification.</Text></View></View>;
  }

  const chooseImage = async (field) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return toast.error('Photo permission is required');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (result.canceled) return;
    setUploading(field);
    try {
      const asset = result.assets[0];
      const uploaded = await uploadKycDocument(asset);
      setForm((current) => ({ ...current, [field]: uploaded.fileId }));
      setPreviews((current) => ({ ...current, [field]: asset.uri }));
    }
    catch (error) { toast.error('Upload failed', error.message); }
    finally { setUploading(''); }
  };
  const submit = async () => {
    if (!form.shopName.trim() || !form.shopAddress.trim()) return toast.error('Shop name and address are required');
    if (!form.idType || !form.idFrontUrl || !form.idBackUrl || !form.selfieUrl) return toast.error('Complete all identity verification fields');
    setSubmitting(true);
    try {
      const response = await apiClient.post(ENDPOINTS.SELLER.APPLICATION, form);
      const updated = { ...user, ...response.data, role: response.data?.role || 'SELLER', sellerApplicationStatus: response.data?.sellerApplicationStatus || 'PENDING' };
      await updateUser(updated);
      toast.success('Application submitted');
      router.replace('/seller');
    } catch (error) { toast.error('Submission failed', error.message); }
    finally { setSubmitting(false); }
  };

  return <View style={styles.screen}><ScreenHeader title="Start Selling" subtitle="Seller verification" /><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.notice}><Store size={20} color={colors.secondary} /><View style={styles.noticeText}><Text style={styles.noticeTitle}>Your shop can be prepared immediately</Text><Text style={styles.noticeBody}>Products and storefront details remain private until admin approval.</Text></View></View>
    <View style={styles.section}><Text style={styles.sectionTitle}>Shop Details</Text><TextField label="Shop name" value={form.shopName} onChangeText={(value) => setForm((current) => ({ ...current, shopName: value }))} autoCapitalize="words" placeholder="Maria's Fresh Farm" /><TextField label="Shop description" value={form.shopDescription} onChangeText={(value) => setForm((current) => ({ ...current, shopDescription: value }))} autoCapitalize="sentences" placeholder="Tell buyers what makes your shop special" multiline /><TextField label="Shop address" value={form.shopAddress} onChangeText={(value) => setForm((current) => ({ ...current, shopAddress: value }))} autoCapitalize="words" placeholder="Barangay, Municipality" /></View>
    <View style={styles.section}><View style={styles.sectionHeading}><IdCard size={20} color={colors.secondary} /><Text style={styles.sectionTitleInline}>Identity Verification</Text></View><Select label="Government ID type" value={form.idType} onChange={(value) => setForm((current) => ({ ...current, idType: value }))} options={ID_TYPES.map((value) => ({ label: value, value }))} placeholder="Select ID type" /><UploadTile label="Front of ID" value={form.idFrontUrl} previewUri={previews.idFrontUrl} loading={uploading === 'idFrontUrl'} onPress={() => chooseImage('idFrontUrl')} /><UploadTile label="Back of ID" value={form.idBackUrl} previewUri={previews.idBackUrl} loading={uploading === 'idBackUrl'} onPress={() => chooseImage('idBackUrl')} /><UploadTile label="Selfie holding ID" value={form.selfieUrl} previewUri={previews.selfieUrl} loading={uploading === 'selfieUrl'} onPress={() => chooseImage('selfieUrl')} /></View>
    <Button title="Submit Seller Application" onPress={submit} loading={submitting} />
  </ScrollView></View>;
}

function UploadTile({ label, value, previewUri, loading, onPress }) {
  return <Pressable style={styles.uploadTile} onPress={onPress}>{value && previewUri ? <Image source={{ uri: previewUri }} style={styles.uploadPreview} /> : <View style={styles.uploadPlaceholder}>{loading ? <ActivityIndicator color={colors.primary} /> : <Upload size={22} color={colors.secondary} />}</View>}<View style={styles.uploadText}><Text style={styles.uploadLabel}>{label}</Text><Text style={styles.uploadHint}>{value ? 'Tap to replace' : 'JPEG, PNG, or WebP'}</Text></View>{value ? <CheckCircle2 size={19} color={colors.primary} /> : null}</Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgSecondary }, content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl }, notice: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.bgGreenLight }, noticeText: { flex: 1 }, noticeTitle: { ...typography.body, color: colors.secondary }, noticeBody: { ...typography.caption, color: colors.textSecondary, marginTop: 2 }, section: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.white }, sectionTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.lg }, sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg }, sectionTitleInline: { ...typography.h3, color: colors.textPrimary }, uploadTile: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm, padding: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.gray50 }, uploadPlaceholder: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: radius.base, backgroundColor: colors.bgGreenLight }, uploadPreview: { width: 54, height: 54, borderRadius: radius.base }, uploadText: { flex: 1 }, uploadLabel: { ...typography.body, color: colors.textPrimary }, uploadHint: { ...typography.caption, color: colors.textMuted, marginTop: 2 }, status: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }, statusTitle: { ...typography.h2, color: colors.textPrimary, marginTop: spacing.lg }, statusText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, lineHeight: 21 }, statusButton: { alignSelf: 'stretch', marginTop: spacing.xl },
});
