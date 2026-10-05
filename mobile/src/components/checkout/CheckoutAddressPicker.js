import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CaretDownIcon } from 'phosphor-react-native';
import Sheet, { SheetOption } from '../Sheet';
import { font, t } from '../../theme';

/*
 * The checkout's address fields (web/src/components/common/PhAddressPicker.jsx
 * + lib/phAddress.js): the province fixed to Oriental Mindoro, the town from
 * the served list (matched to the platform's municipalities for its id), the
 * barangay from PSGC (or typed when it is not listed), and the street.
 * The website's <select>s open a bottom sheet of choices here.
 *
 * value / onChange: { province, provinceCode, municipalityId, municipalityName,
 *   municipalityCode, barangay, barangayCode, street }
 */

const PSGC_BASE = 'https://psgc.gitlab.io/api';
const SERVICE_REGION = { code: '170000000', name: 'MIMAROPA Region', shortName: 'MIMAROPA' };
const SERVICE_PROVINCE = { code: '175200000', name: 'Oriental Mindoro' };
const SERVICE_MUNICIPALITIES = [
  { code: '175201000', name: 'Baco' },
  { code: '175202000', name: 'Bansud' },
  { code: '175203000', name: 'Bongabong' },
  { code: '175204000', name: 'Bulalacao' },
  { code: '175205000', name: 'Calapan City' },
  { code: '175206000', name: 'Gloria' },
  { code: '175207000', name: 'Mansalay' },
  { code: '175208000', name: 'Naujan' },
  { code: '175209000', name: 'Pinamalayan' },
  { code: '175210000', name: 'Pola' },
  { code: '175211000', name: 'Puerto Galera' },
  { code: '175212000', name: 'Roxas' },
  { code: '175213000', name: 'San Teodoro' },
  { code: '175214000', name: 'Socorro' },
  { code: '175215000', name: 'Victoria' },
];

export const normalizeName = (s) => (s || '')
  .toString()
  .toLowerCase()
  .replace(/\s+city$/i, '')
  .replace(/city of\s+/i, '')
  .replace(/[^a-z0-9]+/gi, '')
  .trim();

// A barangay's name for comparing, without a typed "Brgy." or "Barangay" in front.
const barangayKey = (name) => normalizeName(String(name || '').replace(/^(brgy\.?|bgy\.?|barangay)\s+/i, ''));

const cache = new Map();
const cachedFetch = (url) => {
  if (cache.has(url)) return cache.get(url);
  const promise = fetch(url).then((res) => {
    if (!res.ok) throw new Error(`PSGC ${res.status}`);
    return res.json();
  });
  cache.set(url, promise);
  promise.catch(() => cache.delete(url));
  return promise;
};

const listBarangays = async (code) => {
  if (!code) return [];
  let data = await cachedFetch(`${PSGC_BASE}/municipalities/${code}/barangays/`).catch(() => null);
  if (!data) data = await cachedFetch(`${PSGC_BASE}/cities/${code}/barangays/`).catch(() => []);
  return (data || []).map((b) => ({ code: b.code, name: b.name })).sort((a, b) => a.name.localeCompare(b.name));
};

function SelectBox({ value, placeholder, disabled, error, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.input, styles.select, error && styles.inputError, disabled && styles.selectDisabled]}
    >
      <Text style={[styles.selectText, !value && styles.selectPlaceholder]} numberOfLines={1}>{value || placeholder}</Text>
      <CaretDownIcon size={16} weight="bold" color={t.neutral[900]} />
    </Pressable>
  );
}

export default function CheckoutAddressPicker({
  value, onChange, dbMunicipalities = [], dbLoading = false, errors = {}, disabled = false,
  streetLabel = 'Street / House No.', streetPlaceholder = '123 Rizal St.',
}) {
  const v = {
    province: '', provinceCode: '', municipalityId: '', municipalityName: '', municipalityCode: '', barangay: '', barangayCode: '', street: '',
    ...(value || {}),
  };
  const [barangays, setBarangays] = useState([]);
  const [barangaysFor, setBarangaysFor] = useState('');
  const [brgyLoading, setBrgyLoading] = useState(false);
  const [manualBarangay, setManualBarangay] = useState(false);
  const [sheet, setSheet] = useState(null); // 'town' | 'barangay'

  const savedTown = v.municipalityName
    || (v.municipalityId && (dbMunicipalities || []).find((m) => m.id === v.municipalityId)?.name)
    || '';
  const townCode = (savedTown && SERVICE_MUNICIPALITIES.find((x) => normalizeName(x.name) === normalizeName(savedTown))?.code)
    || v.municipalityCode
    || '';
  const townName = SERVICE_MUNICIPALITIES.find((m) => m.code === townCode)?.name || '';

  // Pin the province (and clear a town that belonged to another one).
  useEffect(() => {
    if (normalizeName(v.province) === normalizeName(SERVICE_PROVINCE.name) && v.provinceCode === SERVICE_PROVINCE.code) return;
    const foreign = (v.province && normalizeName(v.province) !== normalizeName(SERVICE_PROVINCE.name))
      || (v.provinceCode && v.provinceCode !== SERVICE_PROVINCE.code);
    onChange({
      ...v,
      province: SERVICE_PROVINCE.name,
      provinceCode: SERVICE_PROVINCE.code,
      ...(foreign ? { municipalityId: '', municipalityName: '', municipalityCode: '', barangay: '', barangayCode: '' } : {}),
    });
  }, [v.province, v.provinceCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // The town's barangays.
  useEffect(() => {
    if (!townCode) {
      setBarangays([]);
      setBarangaysFor('');
      return undefined;
    }
    let cancelled = false;
    setBrgyLoading(true);
    listBarangays(townCode)
      .then((list) => { if (!cancelled) { setBarangays(list); setBarangaysFor(townCode); } })
      .catch(() => { if (!cancelled) { setBarangays([]); setManualBarangay(true); } })
      .finally(() => { if (!cancelled) setBrgyLoading(false); });
    return () => { cancelled = true; };
  }, [townCode]);

  const dbMuniByNormName = useMemo(() => {
    const map = new Map();
    for (const m of dbMunicipalities || []) map.set(normalizeName(m.name), m);
    return map;
  }, [dbMunicipalities]);

  // The town's id comes from the platform's catalogue once it arrives.
  useEffect(() => {
    if (!v.municipalityName || v.municipalityId || dbMuniByNormName.size === 0) return;
    const match = dbMuniByNormName.get(normalizeName(v.municipalityName));
    if (match) onChange({ ...v, municipalityId: match.id });
  }, [dbMuniByNormName, v.municipalityName, v.municipalityId]); // eslint-disable-line react-hooks/exhaustive-deps

  const listReady = Boolean(townCode) && barangaysFor === townCode && barangays.length > 0;
  const namedBarangay = listReady && v.barangay ? barangays.find((b) => barangayKey(b.name) === barangayKey(v.barangay)) : null;
  const barangayCode = namedBarangay?.code || '';
  // A saved barangay the list does not have shows as typed.
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

  const pickTown = (m) => {
    const dbMatch = dbMuniByNormName.get(normalizeName(m.name));
    onChange({ ...v, municipalityCode: m.code, municipalityName: m.name, municipalityId: dbMatch?.id || '', barangay: '', barangayCode: '' });
    setSheet(null);
  };
  const pickBarangay = (b) => {
    onChange({ ...v, barangayCode: b.code, barangay: b.name });
    setSheet(null);
  };

  const currentDbMuni = dbMuniByNormName.get(normalizeName(v.municipalityName));
  const municipalityUnsupported = v.municipalityName && !currentDbMuni && dbMunicipalities.length > 0;
  const townError = errors.municipality || errors.municipalityId;
  const barangayName = namedBarangay?.name || '';

  return (
    <View style={styles.picker}>
      <View style={styles.field}>
        <Text style={styles.label}>Province</Text>
        <TextInput
          value={SERVICE_PROVINCE.name}
          editable={false}
          accessibilityLabel="Province"
          style={[styles.input, styles.locked]}
        />
        <Text style={styles.hint}>We currently serve {SERVICE_PROVINCE.name} ({SERVICE_REGION.shortName}) only.</Text>
        {errors.province ? <Text style={styles.error}>{errors.province}</Text> : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>City / Municipality</Text>
        <SelectBox
          value={townName}
          placeholder={dbLoading ? 'Loading municipalities…' : 'Select city / municipality'}
          disabled={disabled || dbLoading}
          error={Boolean(townError)}
          onPress={() => setSheet('town')}
        />
        {townError ? <Text style={styles.error}>{townError}</Text> : null}
        {municipalityUnsupported ? (
          <Text style={styles.note}>This city/municipality is not yet supported. Please choose a supported area.</Text>
        ) : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Barangay</Text>
        {!typing && barangays.length > 0 ? (
          <SelectBox
            value={barangayName}
            placeholder={brgyLoading ? 'Loading barangays…' : !townCode ? 'Select a municipality first' : 'Select barangay'}
            disabled={disabled || !townCode || brgyLoading}
            error={Boolean(errors.barangay)}
            onPress={() => setSheet('barangay')}
          />
        ) : (
          <TextInput
            value={v.barangay || ''}
            onChangeText={(text) => onChange({ ...v, barangayCode: '', barangay: text })}
            placeholder="Enter barangay"
            placeholderTextColor="#757575"
            editable={!disabled}
            style={[styles.input, errors.barangay && styles.inputError]}
          />
        )}
        {errors.barangay ? <Text style={styles.error}>{errors.barangay}</Text> : null}
        {townCode ? (
          <Pressable onPress={toggleManual} style={styles.toggle} accessibilityRole="button">
            <Text style={styles.toggleText}>{typing ? 'Use dropdown' : 'Barangay not listed? Enter manually'}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{streetLabel}</Text>
        <TextInput
          value={v.street || ''}
          onChangeText={(text) => onChange({ ...v, street: text })}
          placeholder={streetPlaceholder}
          placeholderTextColor="#757575"
          editable={!disabled}
          style={[styles.input, errors.street && styles.inputError]}
        />
        {errors.street ? <Text style={styles.error}>{errors.street}</Text> : null}
      </View>

      <Sheet open={sheet === 'town'} title="City / Municipality" onClose={() => setSheet(null)}>
        {SERVICE_MUNICIPALITIES.map((m) => {
          const supported = dbMuniByNormName.has(normalizeName(m.name));
          const off = dbMunicipalities.length > 0 && !supported;
          return (
            <SheetOption
              key={m.code}
              label={`${m.name}${off ? ' (unavailable)' : ''}`}
              selected={m.code === townCode}
              onPress={off ? undefined : () => pickTown(m)}
              style={off ? styles.optionOff : undefined}
            />
          );
        })}
      </Sheet>
      <Sheet open={sheet === 'barangay'} title="Barangay" onClose={() => setSheet(null)}>
        {barangays.map((b) => (
          <SheetOption key={b.code} label={b.name} selected={b.code === barangayCode} onPress={() => pickBarangay(b)} />
        ))}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  picker: { gap: 12 },
  field: { gap: 4 },
  label: { fontSize: 13, lineHeight: 20.8, ...font(500), color: t.neutral[700] },
  input: {
    height: 46,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: t.neutral[300],
    borderRadius: 10,
    backgroundColor: t.neutral[0],
    fontSize: 16,
    ...font(400),
    color: t.neutral[900],
  },
  inputError: { borderColor: t.danger[600] },
  locked: { backgroundColor: t.neutral[50], color: t.neutral[700] },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingLeft: 13 },
  selectDisabled: { opacity: 0.7 },
  selectText: { flex: 1, fontSize: 16, lineHeight: 22, ...font(400), color: t.neutral[900] },
  selectPlaceholder: { color: t.neutral[900] },
  hint: { fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[500] },
  error: { fontSize: 12, lineHeight: 19.2, ...font(400), color: t.danger[600] },
  note: { fontSize: 12, lineHeight: 19.2, ...font(400), color: t.warning[700] },
  toggle: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  toggleText: { fontSize: 13, lineHeight: 15.6, ...font(400), color: t.info[600], textDecorationLine: 'underline' },
  optionOff: { opacity: 0.45 },
});
