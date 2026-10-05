import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CaretDownIcon } from 'phosphor-react-native';
import Sheet, { SheetOption } from '../Sheet';
import { AuthFieldError, AuthInput, AuthLabel } from './AuthForm';
import {
  SERVICE_PROVINCE, SERVICE_REGION, listServiceMunicipalities, listBarangaysByMunicipality, normalizeName,
} from './authAddress';
import { font, t } from '../../theme';

/*
 * The website's address picker (web/src/components/common/PhAddressPicker.jsx
 * + .css at phone width) for the sign-up forms: the province fixed to
 * Oriental Mindoro, the town from a fixed list matched to the platform's
 * municipalities (so `municipalityId` is a real one), the barangay from PSGC
 * with typing it as the fallback, and the street.
 *
 * value / onChange: { province, provinceCode, municipalityId, municipalityName,
 * municipalityCode, barangay, barangayCode, street } (onChange gets the
 * changed fields merged into the value, as on the website).
 * The website's dropdowns are the phone's own pickers; here they open a sheet.
 */

const emptyValue = {
  province: '',
  provinceCode: '',
  municipalityId: '',
  municipalityName: '',
  municipalityCode: '',
  barangay: '',
  barangayCode: '',
  street: '',
};

const isServiceProvince = (name, code) =>
  normalizeName(name) === normalizeName(SERVICE_PROVINCE.name) && code === SERVICE_PROVINCE.code;

const barangayKey = (name) => normalizeName(String(name || '').replace(/^(brgy\.?|bgy\.?|barangay)\s+/i, ''));

export default function AuthAddressPicker({
  value,
  onChange,
  dbMunicipalities = [],
  dbLoading = false,
  showStreet = true,
  errors = {},
  disabled = false,
  streetLabel = 'Street / House No.',
  streetPlaceholder = '123 Rizal St.',
}) {
  const v = { ...emptyValue, ...(value || {}) };
  const municipalities = useMemo(() => listServiceMunicipalities(), []);
  const [barangays, setBarangays] = useState([]);
  const [barangaysFor, setBarangaysFor] = useState('');
  const [brgyLoading, setBrgyLoading] = useState(false);
  const [manualBarangay, setManualBarangay] = useState(false);
  const [picking, setPicking] = useState(null); // 'town' | 'barangay' | null

  const savedTown = v.municipalityName
    || (v.municipalityId && (dbMunicipalities || []).find((m) => m.id === v.municipalityId)?.name)
    || '';
  const townCode = (savedTown && municipalities.find((x) => normalizeName(x.name) === normalizeName(savedTown))?.code)
    || v.municipalityCode
    || '';

  // Pin the province (and clear a town and barangay from another one).
  useEffect(() => {
    if (isServiceProvince(v.province, v.provinceCode)) return;
    const foreign =
      (v.province && normalizeName(v.province) !== normalizeName(SERVICE_PROVINCE.name)) ||
      (v.provinceCode && v.provinceCode !== SERVICE_PROVINCE.code);
    onChange({
      ...v,
      province: SERVICE_PROVINCE.name,
      provinceCode: SERVICE_PROVINCE.code,
      ...(foreign
        ? { municipalityId: '', municipalityName: '', municipalityCode: '', barangay: '', barangayCode: '' }
        : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.province, v.provinceCode]);

  // The town's barangays.
  useEffect(() => {
    if (!townCode) {
      setBarangays([]);
      setBarangaysFor('');
      return undefined;
    }
    let cancelled = false;
    const code = townCode;
    setBrgyLoading(true);
    (async () => {
      try {
        const list = await listBarangaysByMunicipality(code);
        if (!cancelled) {
          setBarangays(list);
          setBarangaysFor(code);
        }
      } catch {
        if (!cancelled) {
          setBarangays([]);
          setManualBarangay(true);
        }
      } finally {
        if (!cancelled) setBrgyLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [townCode]);

  const dbMuniByNormName = useMemo(() => {
    const map = new Map();
    for (const m of dbMunicipalities || []) map.set(normalizeName(m.name), m);
    return map;
  }, [dbMunicipalities]);

  // A town picked before the platform's list arrived gets its id once it does.
  useEffect(() => {
    if (!v.municipalityName || v.municipalityId || dbMuniByNormName.size === 0) return;
    const match = dbMuniByNormName.get(normalizeName(v.municipalityName));
    if (match) onChange({ ...v, municipalityId: match.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbMuniByNormName, v.municipalityName, v.municipalityId]);

  const listReady = Boolean(townCode) && barangaysFor === townCode && barangays.length > 0;
  const namedBarangay = listReady && v.barangay
    ? barangays.find((b) => barangayKey(b.name) === barangayKey(v.barangay))
    : null;
  const barangayCode = namedBarangay?.code || '';
  const offList = listReady && Boolean(v.barangay) && !namedBarangay;
  const typing = manualBarangay || offList;

  const toggleManual = () => {
    if (!typing) {
      setManualBarangay(true);
      return;
    }
    setManualBarangay(false);
    if (offList) onChange({ barangay: '', barangayCode: '' });
  };

  const pickTown = (code) => {
    const m = municipalities.find((x) => x.code === code);
    const dbMatch = m ? dbMuniByNormName.get(normalizeName(m.name)) : null;
    onChange({
      ...v,
      municipalityCode: code,
      municipalityName: m?.name || '',
      municipalityId: dbMatch?.id || '',
      barangay: '',
      barangayCode: '',
    });
    setPicking(null);
  };

  const pickBarangay = (code) => {
    const b = barangays.find((x) => x.code === code);
    onChange({ ...v, barangayCode: code, barangay: b?.name || '' });
    setPicking(null);
  };

  const currentDbMuni = dbMuniByNormName.get(normalizeName(v.municipalityName));
  const municipalityUnsupported = v.municipalityName && !currentDbMuni && dbMunicipalities.length > 0;
  const townError = errors.municipality || errors.municipalityId;
  const townName = municipalities.find((m) => m.code === townCode)?.name || '';
  const barangayName = barangays.find((b) => b.code === barangayCode)?.name || '';

  return (
    <View style={styles.picker}>
      <View style={styles.field}>
        <AuthLabel kind="ph">Province</AuthLabel>
        <AuthInput kind="ph" locked value={SERVICE_PROVINCE.name} error={errors.province} accessibilityLabel="Province" />
        <Text style={styles.hint}>
          We currently serve {SERVICE_PROVINCE.name} ({SERVICE_REGION.shortName}) only.
        </Text>
        {errors.province ? <AuthFieldError kind="ph">{errors.province}</AuthFieldError> : null}
      </View>

      <View style={styles.field}>
        <AuthLabel kind="ph">City / Municipality</AuthLabel>
        <SelectBox
          label="City / Municipality"
          text={townName || (dbLoading ? 'Loading municipalities…' : 'Select city / municipality')}
          error={townError}
          disabled={disabled || dbLoading}
          onPress={() => setPicking('town')}
        />
        {townError ? <AuthFieldError kind="ph">{townError}</AuthFieldError> : null}
        {municipalityUnsupported ? (
          <Text style={styles.note}>This city/municipality is not yet supported. Please choose a supported area.</Text>
        ) : null}
      </View>

      <View style={styles.field}>
        <AuthLabel kind="ph">Barangay</AuthLabel>
        {!typing && barangays.length > 0 ? (
          <SelectBox
            label="Barangay"
            text={barangayName || (brgyLoading ? 'Loading barangays…' : !townCode ? 'Select a municipality first' : 'Select barangay')}
            error={errors.barangay}
            disabled={disabled || !townCode || brgyLoading}
            onPress={() => setPicking('barangay')}
          />
        ) : (
          <AuthInput
            kind="ph"
            value={v.barangay || ''}
            onChangeText={(text) => onChange({ ...v, barangayCode: '', barangay: text })}
            placeholder="Enter barangay"
            editable={!disabled}
            error={errors.barangay}
            accessibilityLabel="Barangay"
          />
        )}
        {errors.barangay ? <AuthFieldError kind="ph">{errors.barangay}</AuthFieldError> : null}
        {townCode ? (
          <Pressable accessibilityRole="button" onPress={toggleManual} style={styles.toggle}>
            <Text style={styles.toggleText}>{typing ? 'Use dropdown' : 'Barangay not listed? Enter manually'}</Text>
          </Pressable>
        ) : null}
      </View>

      {showStreet ? (
        <View style={styles.field}>
          <AuthLabel kind="ph">{streetLabel}</AuthLabel>
          <AuthInput
            kind="ph"
            value={v.street || ''}
            onChangeText={(text) => onChange({ ...v, street: text })}
            placeholder={streetPlaceholder}
            editable={!disabled}
            error={errors.street}
            accessibilityLabel={streetLabel}
          />
          {errors.street ? <AuthFieldError kind="ph">{errors.street}</AuthFieldError> : null}
        </View>
      ) : null}

      <Sheet open={picking === 'town'} title="City / Municipality" onClose={() => setPicking(null)}>
        {municipalities.map((m) => {
          const supported = dbMuniByNormName.has(normalizeName(m.name));
          const off = dbMunicipalities.length > 0 && !supported;
          return (
            <SheetOption
              key={m.code}
              label={`${m.name}${off ? ' (unavailable)' : ''}`}
              selected={m.code === townCode}
              onPress={off ? undefined : () => pickTown(m.code)}
              style={off ? styles.optionOff : undefined}
            />
          );
        })}
      </Sheet>

      <Sheet open={picking === 'barangay'} title="Barangay" onClose={() => setPicking(null)}>
        {barangays.map((b) => (
          <SheetOption key={b.code} label={b.name} selected={b.code === barangayCode} onPress={() => pickBarangay(b.code)} />
        ))}
      </Sheet>
    </View>
  );
}

/** A dropdown field (the website's <select class="ph-input">). */
function SelectBox({ label, text, error, disabled, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.select, error && styles.selectError, disabled && styles.selectDisabled]}
    >
      <Text style={[styles.selectText, disabled && styles.selectTextDisabled]} numberOfLines={1}>{text}</Text>
      <CaretDownIcon size={14} weight="bold" color={disabled ? t.neutral[400] : t.neutral[700]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  picker: { gap: 12 },
  field: { gap: 4 },
  hint: { fontSize: 12, lineHeight: 19.2, color: t.neutral[500], ...font(400) },
  note: { fontSize: 12, lineHeight: 19.2, color: t.warning[700], ...font(400) },
  toggle: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  toggleText: { fontSize: 13, lineHeight: 20.8, color: t.info[600], textDecorationLine: 'underline', ...font(400) },
  select: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 16,
    paddingRight: 10,
    borderWidth: 1,
    borderColor: t.neutral[300],
    borderRadius: 10,
    backgroundColor: t.neutral[0],
  },
  selectError: { borderColor: t.danger[600] },
  selectDisabled: { backgroundColor: t.neutral[100] },
  selectText: { flex: 1, fontSize: 16, color: t.neutral[900], ...font(400) },
  selectTextDisabled: { color: t.neutral[500] },
  optionOff: { opacity: 0.45 },
});
