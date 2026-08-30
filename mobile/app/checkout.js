import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeftIcon as ArrowLeft, CheckIcon as Check, CheckCircleIcon as CheckCircle2, CreditCardIcon as CreditCard, MapPinIcon as MapPin, PackageIcon as Package, StorefrontIcon as Store, TruckIcon as Truck, UploadSimpleIcon as Upload } from 'phosphor-react-native';
import apiClient from '../src/api/client';
import { ENDPOINTS } from '../src/api/endpoints';
import TextField from '../src/components/TextField';
import Select from '../src/components/Select';
import useAuthStore from '../src/store/authStore';
import useCartStore from '../src/store/cartStore';
import { resolveImg } from '../src/lib/media';
import { toast } from '../src/lib/toast';
import { uploadImage } from '../src/lib/upload';
import { colors, fontFamily, radius, spacing, typography } from '../src/theme';

const peso = (value) => `₱${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

export default function Checkout() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const allCartItems = useCartStore((state) => state.items);
  const selectedProductIds = useCartStore((state) => state.selectedProductIds);
  const removeSelectedItems = useCartStore((state) => state.removeSelectedItems);

  // Only the cart items the buyer selected (checked) are sent to checkout.
  const items = useMemo(() => allCartItems.filter((item) => selectedProductIds.includes(item.id)), [allCartItems, selectedProductIds]);

  const [step, setStep] = useState(1);
  const [municipalities, setMunicipalities] = useState([]);
  const [storeInfo, setStoreInfo] = useState({});
  const [fulfillmentMethod, setFulfillmentMethod] = useState('DELIVERY');
  const [paymentMethod, setPaymentMethod] = useState('COD');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentProofUrl, setPaymentProofUrl] = useState('');
  const [uploadingProof, setUploadingProof] = useState(false);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderIds, setOrderIds] = useState([]);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [form, setForm] = useState({
    fullName: user?.fullName || '',
    contactNumber: user?.contactNumber || '',
    street: user?.address || '',
    barangay: user?.barangay || '',
    municipalityId: user?.municipalityId || '',
  });

  const groupedItems = useMemo(() => {
    return items.reduce((result, item) => {
      if (!result[item.storeId]) result[item.storeId] = [];
      result[item.storeId].push(item);
      return result;
    }, {});
  }, [items]);
  const storeIds = useMemo(() => Object.keys(groupedItems), [groupedItems]);
  const storeKey = storeIds.join(',');
  const subtotal = items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  const shippingFee = fulfillmentMethod === 'PICKUP' ? 0 : subtotal >= 500 ? 0 : 50;
  const total = subtotal + shippingFee;

  useEffect(() => {
    if (!items.length && !orderIds.length) router.replace('/cart');
  }, [items.length, orderIds.length, router]);

  useEffect(() => {
    apiClient.get(ENDPOINTS.MUNICIPALITIES)
      .then((res) => setMunicipalities(res.data || []))
      .catch(() => setMunicipalities([]));
  }, []);

  const applySavedAddress = (addr) => {
    setSelectedAddressId(addr.id);
    setForm((current) => ({
      ...current,
      fullName: addr.fullName || '',
      contactNumber: addr.contactNumber || '',
      street: addr.street || '',
      barangay: addr.barangay || '',
      municipalityId: addr.municipalityId || '',
    }));
    setErrors({});
  };

  const useManualAddress = () => setSelectedAddressId(null);

  useEffect(() => {
    apiClient.get(ENDPOINTS.ADDRESSES.LIST)
      .then((res) => {
        const list = res.data || [];
        setSavedAddresses(list);
        const def = list.find((item) => item.isDefault) || list[0];
        if (def) applySavedAddress(def);
      })
      .catch(() => setSavedAddresses([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      storeIds.map(async (id) => {
        try {
          const res = await apiClient.get(ENDPOINTS.STORES.BY_ID(id));
          return [id, res.data];
        } catch {
          return [id, null];
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      setStoreInfo((previous) => {
        const next = { ...previous };
        entries.forEach(([id, store]) => {
          next[id] = { ...(next[id] || {}), store };
        });
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [storeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const checkCoverage = useCallback(async () => {
    if (fulfillmentMethod !== 'DELIVERY' || !form.municipalityId) return;
    const entries = await Promise.all(
      storeIds.map(async (id) => {
        try {
          const res = await apiClient.get(ENDPOINTS.STORES.COVERAGE(id), {
            params: { municipalityId: form.municipalityId, barangay: form.barangay || undefined },
          });
          return [id, Boolean(res.data?.covered)];
        } catch {
          return [id, false];
        }
      })
    );
    setStoreInfo((previous) => {
      const next = { ...previous };
      entries.forEach(([id, covered]) => {
        next[id] = { ...(next[id] || {}), covered, checked: true };
      });
      return next;
    });
  }, [form.barangay, form.municipalityId, fulfillmentMethod, storeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    checkCoverage();
  }, [checkCoverage]);

  const fulfillmentAvailability = useMemo(() => {
    const stores = storeIds.map((id) => storeInfo[id]?.store).filter(Boolean);
    if (!stores.length) return { delivery: true, pickup: true };
    return {
      delivery: stores.every((store) => store.fulfillmentMode === 'DELIVERY' || store.fulfillmentMode === 'BOTH'),
      pickup: stores.every((store) => store.fulfillmentMode === 'PICKUP' || store.fulfillmentMode === 'BOTH'),
    };
  }, [storeInfo, storeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const paymentAvailability = useMemo(() => {
    const stores = storeIds.map((id) => storeInfo[id]?.store).filter(Boolean);
    if (!stores.length) return { COD: true, GCASH: true, QRPH: true };
    return {
      COD: stores.every((store) => store.acceptsCod !== false),
      GCASH: stores.every((store) => store.paymentQrImage && store.paymentQrType === 'GCASH'),
      QRPH: stores.every((store) => store.paymentQrImage && store.paymentQrType === 'QRPH'),
    };
  }, [storeInfo, storeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!fulfillmentAvailability.delivery && fulfillmentAvailability.pickup) setFulfillmentMethod('PICKUP');
    if (!fulfillmentAvailability.pickup && fulfillmentAvailability.delivery) setFulfillmentMethod('DELIVERY');
  }, [fulfillmentAvailability]);

  useEffect(() => {
    if (!paymentAvailability[paymentMethod]) {
      const fallback = ['COD', 'GCASH', 'QRPH'].find((method) => paymentAvailability[method]);
      if (fallback) setPaymentMethod(fallback);
    }
  }, [paymentAvailability, paymentMethod]);

  const updateForm = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }));
    if (errors[name]) setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const validateFulfillment = () => {
    const nextErrors = {};
    if (!form.fullName.trim()) nextErrors.fullName = 'Full name is required.';
    if (!form.contactNumber.trim()) nextErrors.contactNumber = 'Contact number is required.';
    if (fulfillmentMethod === 'DELIVERY') {
      if (!form.street.trim()) nextErrors.street = 'Street / house address is required.';
      if (!form.barangay.trim()) nextErrors.barangay = 'Barangay is required.';
      if (!form.municipalityId) nextErrors.municipalityId = 'Municipality is required.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return false;
    if (fulfillmentMethod === 'DELIVERY' && storeIds.some((id) => storeInfo[id]?.checked && !storeInfo[id]?.covered)) {
      toast.error('Delivery unavailable', 'Choose Pickup or update your address.');
      return false;
    }
    return true;
  };

  const goToPayment = () => {
    if (validateFulfillment()) setStep(2);
  };

  const goToReview = () => {
    if ((paymentMethod === 'GCASH' || paymentMethod === 'QRPH') && !paymentReference.trim()) {
      toast.error('Payment reference is required');
      return;
    }
    setStep(3);
  };

  const selectPaymentProof = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.error('Photo permission is required');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setUploadingProof(true);
    try {
      const uploaded = await uploadImage(result.assets[0]);
      setPaymentProofUrl(uploaded.url);
      toast.success('Payment proof uploaded');
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploadingProof(false);
    }
  };

  const municipalityName = municipalities.find((item) => item.id === form.municipalityId)?.name || '';
  const deliveryAddress = `${form.street}, ${form.barangay}, ${municipalityName}, Oriental Mindoro`;

  const placeOrder = async () => {
    setIsSubmitting(true);
    try {
      const responses = await Promise.all(
        Object.entries(groupedItems).map(([storeId, storeItems]) => {
          const store = storeInfo[storeId]?.store;
          return apiClient.post(ENDPOINTS.ORDERS.CREATE, {
            storeId,
            fulfillmentMethod,
            paymentMethod,
            paymentReference: paymentReference || undefined,
            paymentProofUrl: paymentProofUrl || undefined,
            deliveryAddress: fulfillmentMethod === 'DELIVERY' ? deliveryAddress : store?.pickupAddress || 'Store pickup',
            contactNumber: form.contactNumber,
            deliveryNotes: notes || undefined,
            buyerMunicipalityId: form.municipalityId || undefined,
            buyerBarangay: form.barangay || undefined,
            items: storeItems.map((item) => ({ productId: item.id, quantity: item.quantity })),
          });
        })
      );
      const ids = responses.map((response) => response.data?.id).filter(Boolean);
      setOrderIds(ids);
      removeSelectedItems();
      toast.success('Order placed successfully');
    } catch (err) {
      toast.error('Failed to place order', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (orderIds.length) {
    return (
      <View style={styles.successScreen}>
        <Stack.Screen options={{ headerShown: false }} />
        <CheckCircle2 size={64} color={colors.success} />
        <Text style={styles.successTitle}>Order Placed Successfully!</Text>
        <Text style={styles.successText}>Your order has been received and is being processed.</Text>
        <Text style={styles.orderReference}>{orderIds.length} {orderIds.length === 1 ? 'order' : 'orders'} created</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.replace('/orders')}>
          <Text style={styles.primaryButtonText}>View My Orders</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.replace('/products')}>
          <Text style={styles.secondaryButtonText}>Continue Shopping</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => (step > 1 ? setStep(step - 1) : (router.canGoBack() ? router.back() : router.replace('/')))}>
          <ArrowLeft size={21} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={styles.iconButton} />
      </View>
      <ProgressSteps current={step} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 1 ? (
          <View style={styles.card}>
            <SectionHeader icon={<Truck size={21} color={colors.secondary} />} title="Fulfillment Method" />
            <Choice
              title="Delivery"
              description={fulfillmentAvailability.delivery ? 'Have it delivered to your address' : 'Not available for these stores'}
              selected={fulfillmentMethod === 'DELIVERY'}
              disabled={!fulfillmentAvailability.delivery}
              onPress={() => setFulfillmentMethod('DELIVERY')}
              icon={<Truck size={19} color={colors.secondary} />}
            />
            <Choice
              title="Pickup"
              description={fulfillmentAvailability.pickup ? 'Collect your order from the store' : 'Not available for these stores'}
              selected={fulfillmentMethod === 'PICKUP'}
              disabled={!fulfillmentAvailability.pickup}
              onPress={() => setFulfillmentMethod('PICKUP')}
              icon={<Store size={19} color={colors.secondary} />}
            />

            <SectionHeader icon={<MapPin size={21} color={colors.secondary} />} title="Contact & Address" />
            {fulfillmentMethod === 'DELIVERY' && savedAddresses.length > 0 ? (
              <View style={styles.savedAddressList}>
                {savedAddresses.map((addr) => (
                  <Choice
                    key={addr.id}
                    title={`${addr.label ? `${addr.label} — ` : ''}${addr.fullName}${addr.isDefault ? '  •  Default' : ''}`}
                    description={`${addr.street}, ${addr.barangay}, ${addr.municipality?.name || ''}`}
                    selected={selectedAddressId === addr.id}
                    onPress={() => applySavedAddress(addr)}
                    icon={<MapPin size={19} color={colors.secondary} />}
                  />
                ))}
                <Choice
                  title="Enter a different address"
                  description="Use a one-off address for this order"
                  selected={selectedAddressId === null}
                  onPress={useManualAddress}
                  icon={<MapPin size={19} color={colors.secondary} />}
                />
              </View>
            ) : null}
            <TextField label="Full Name" value={form.fullName} onChangeText={(value) => updateForm('fullName', value)} error={errors.fullName} autoCapitalize="words" />
            <TextField label="Contact Number" value={form.contactNumber} onChangeText={(value) => updateForm('contactNumber', value)} error={errors.contactNumber} keyboardType="phone-pad" />
            {fulfillmentMethod === 'DELIVERY' ? (
              <>
                <TextField label="Street / House Address" value={form.street} onChangeText={(value) => updateForm('street', value)} error={errors.street} autoCapitalize="words" />
                <TextField label="Barangay" value={form.barangay} onChangeText={(value) => updateForm('barangay', value)} error={errors.barangay} autoCapitalize="words" />
                <Select
                  label="Municipality"
                  value={form.municipalityId}
                  options={municipalities.map((item) => ({ label: item.name, value: item.id }))}
                  onChange={(value) => updateForm('municipalityId', value)}
                  error={errors.municipalityId}
                  placeholder="Select municipality"
                />
              </>
            ) : (
              <View style={styles.pickupAddresses}>
                {storeIds.map((id) => (
                  <Text key={id} style={styles.mutedText}>{storeInfo[id]?.store?.name}: {storeInfo[id]?.store?.pickupAddress || 'Store pickup location'}</Text>
                ))}
              </View>
            )}
            <TextField label="Delivery Notes (Optional)" value={notes} onChangeText={setNotes} autoCapitalize="sentences" multiline />
            <Pressable style={styles.primaryButton} onPress={goToPayment}>
              <Text style={styles.primaryButtonText}>Continue to Payment</Text>
            </Pressable>
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.card}>
            <SectionHeader icon={<CreditCard size={21} color={colors.secondary} />} title="Payment Method" />
            {[
              ['COD', 'Cash on Delivery', 'Pay when your order arrives'],
              ['GCASH', 'GCash', 'Pay through the store’s GCash QR'],
              ['QRPH', 'QR Ph', 'Pay through the store’s QR Ph code'],
            ].map(([value, title, description]) => (
              <Choice
                key={value}
                title={title}
                description={paymentAvailability[value] ? description : 'Not available for these stores'}
                selected={paymentMethod === value}
                disabled={!paymentAvailability[value]}
                onPress={() => setPaymentMethod(value)}
                icon={<CreditCard size={19} color={colors.secondary} />}
              />
            ))}
            {paymentMethod !== 'COD' ? (
              <>
                {storeIds.map((id) => {
                  const store = storeInfo[id]?.store;
                  return store?.paymentQrImage ? (
                    <View key={id} style={styles.qrCard}>
                      <Text style={styles.qrStore}>{store.name}</Text>
                      <Image source={{ uri: resolveImg(store.paymentQrImage) }} style={styles.qrImage} resizeMode="contain" />
                      {store.paymentInstructions ? <Text style={styles.mutedText}>{store.paymentInstructions}</Text> : null}
                    </View>
                  ) : null;
                })}
                <TextField label="Payment Reference Number" value={paymentReference} onChangeText={setPaymentReference} />
                <Pressable style={styles.uploadButton} onPress={selectPaymentProof} disabled={uploadingProof}>
                  {uploadingProof ? <ActivityIndicator color={colors.secondary} /> : <Upload size={18} color={colors.secondary} />}
                  <Text style={styles.uploadText}>{paymentProofUrl ? 'Replace Payment Proof' : 'Upload Payment Proof'}</Text>
                  {paymentProofUrl ? <Check size={17} color={colors.success} /> : null}
                </Pressable>
              </>
            ) : null}
            <Pressable style={styles.primaryButton} onPress={goToReview}>
              <Text style={styles.primaryButtonText}>Review Order</Text>
            </Pressable>
          </View>
        ) : null}

        {step === 3 ? (
          <View style={styles.card}>
            <SectionHeader icon={<Package size={21} color={colors.secondary} />} title="Review Your Order" />
            {storeIds.map((id) => (
              <View key={id} style={styles.reviewStore}>
                <Text style={styles.reviewStoreName}>{storeInfo[id]?.store?.name || groupedItems[id][0]?.storeName}</Text>
                {groupedItems[id].map((item) => (
                  <View key={item.id} style={styles.reviewItem}>
                    <Text style={styles.reviewItemName}>{item.name} × {item.quantity}</Text>
                    <Text style={styles.reviewItemPrice}>{peso(Number(item.price) * item.quantity)}</Text>
                  </View>
                ))}
              </View>
            ))}
            <View style={styles.reviewDetails}>
              <ReviewRow label="Fulfillment" value={fulfillmentMethod === 'DELIVERY' ? 'Delivery' : 'Pickup'} />
              <ReviewRow label="Payment" value={paymentMethod === 'COD' ? 'Cash on Delivery' : paymentMethod} />
              {fulfillmentMethod === 'DELIVERY' ? <ReviewRow label="Address" value={deliveryAddress} /> : null}
              <ReviewRow label="Contact" value={form.contactNumber} />
            </View>
            <ReviewRow label="Subtotal" value={peso(subtotal)} />
            <ReviewRow label="Shipping" value={shippingFee === 0 ? 'Free' : peso(shippingFee)} />
            <View style={styles.divider} />
            <ReviewRow label="Total" value={peso(total)} strong />
            <Pressable style={[styles.primaryButton, isSubmitting && styles.disabled]} onPress={placeOrder} disabled={isSubmitting}>
              {isSubmitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Place Order</Text>}
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ProgressSteps({ current }) {
  return (
    <View style={styles.progress}>
      {['Fulfillment', 'Payment', 'Review'].map((label, index) => {
        const number = index + 1;
        return (
          <View key={label} style={styles.progressItem}>
            <View style={[styles.progressCircle, current >= number && styles.progressCircleActive]}>
              <Text style={[styles.progressNumber, current >= number && styles.progressNumberActive]}>{number}</Text>
            </View>
            <Text style={[styles.progressLabel, current >= number && styles.progressLabelActive]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function SectionHeader({ icon, title }) {
  return <View style={styles.sectionHeader}>{icon}<Text style={styles.sectionTitle}>{title}</Text></View>;
}

function Choice({ title, description, selected, disabled, onPress, icon }) {
  return (
    <Pressable style={[styles.choice, selected && styles.choiceSelected, disabled && styles.disabled]} onPress={onPress} disabled={disabled}>
      {icon}
      <View style={styles.choiceText}><Text style={styles.choiceTitle}>{title}</Text><Text style={styles.mutedText}>{description}</Text></View>
      <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
    </Pressable>
  );
}

function ReviewRow({ label, value, strong }) {
  return <View style={styles.reviewRow}><Text style={[styles.reviewLabel, strong && styles.strong]}>{label}</Text><Text style={[styles.reviewValue, strong && styles.total]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgSecondary },
  header: { height: 56, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...typography.h3, flex: 1, textAlign: 'center', color: colors.textPrimary },
  progress: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: spacing.md, backgroundColor: colors.white },
  progressItem: { flex: 1, alignItems: 'center', gap: spacing.xs },
  progressCircle: { width: 28, height: 28, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gray200 },
  progressCircleActive: { backgroundColor: colors.primary },
  progressNumber: { ...typography.caption, color: colors.textSecondary },
  progressNumberActive: { color: colors.white },
  progressLabel: { ...typography.caption, color: colors.textMuted },
  progressLabelActive: { color: colors.secondary },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  card: { padding: spacing.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.borderLight, borderRadius: radius.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md, marginTop: spacing.sm },
  sectionTitle: { ...typography.h3, color: colors.textPrimary },
  choice: { minHeight: 68, marginBottom: spacing.sm, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.borderLight, borderRadius: radius.lg },
  choiceSelected: { borderColor: colors.primary, backgroundColor: colors.bgGreenLight },
  choiceText: { flex: 1, gap: 2 },
  choiceTitle: { ...typography.body, color: colors.textPrimary, fontFamily: fontFamily.semiBold, fontWeight: '600' },
  mutedText: { ...typography.caption, color: colors.textSecondary, lineHeight: 17 },
  savedAddressList: { marginBottom: spacing.sm },
  radio: { width: 19, height: 19, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.borderMedium, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 9, height: 9, borderRadius: radius.full, backgroundColor: colors.primary },
  pickupAddresses: { padding: spacing.md, marginBottom: spacing.md, gap: spacing.xs, backgroundColor: colors.gray50, borderRadius: radius.base },
  primaryButton: { minHeight: 48, marginTop: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.base, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  primaryButtonText: { ...typography.body, color: colors.white, fontFamily: fontFamily.semiBold, fontWeight: '600' },
  secondaryButton: { minHeight: 46, marginTop: spacing.sm, paddingHorizontal: spacing.lg, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.base, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { ...typography.body, color: colors.secondary },
  qrCard: { alignItems: 'center', padding: spacing.md, marginBottom: spacing.md, gap: spacing.sm, backgroundColor: colors.gray50, borderRadius: radius.lg },
  qrStore: { ...typography.body, color: colors.textPrimary, fontFamily: fontFamily.semiBold, fontWeight: '600' },
  qrImage: { width: 210, height: 210 },
  uploadButton: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.base },
  uploadText: { ...typography.body, color: colors.secondary },
  reviewStore: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  reviewStoreName: { ...typography.body, marginBottom: spacing.sm, color: colors.textPrimary, fontFamily: fontFamily.semiBold, fontWeight: '600' },
  reviewItem: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 3 },
  reviewItemName: { ...typography.caption, flex: 1, color: colors.textSecondary },
  reviewItemPrice: { ...typography.caption, color: colors.textPrimary },
  reviewDetails: { paddingVertical: spacing.md, gap: spacing.sm },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.lg, paddingVertical: 3 },
  reviewLabel: { ...typography.body, color: colors.textSecondary },
  reviewValue: { ...typography.body, flex: 1, textAlign: 'right', color: colors.textPrimary },
  strong: { color: colors.textPrimary, fontFamily: fontFamily.semiBold, fontWeight: '600' },
  total: { ...typography.h3, color: colors.primaryDark },
  divider: { height: 1, marginVertical: spacing.sm, backgroundColor: colors.borderLight },
  disabled: { opacity: 0.45 },
  successScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm, backgroundColor: colors.bgPrimary },
  successTitle: { ...typography.h2, marginTop: spacing.sm, color: colors.textPrimary, textAlign: 'center' },
  successText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  orderReference: { ...typography.caption, marginVertical: spacing.sm, color: colors.secondary },
});
