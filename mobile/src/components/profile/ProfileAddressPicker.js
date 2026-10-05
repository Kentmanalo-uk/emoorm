import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CaretDownIcon } from 'phosphor-react-native';
import Sheet, { SheetOption } from '../Sheet';
import { font, t } from '../../theme';

/*
 * The Philippine address picker (web/src/components/common/PhAddressPicker.jsx
 * + lib/phAddress.js), scoped to the province E-MOORM serves: the province is
 * fixed, the towns are a fixed list cross-checked against the platform's own
 * municipalities (so `municipalityId` is a valid id), the barangays come from
 * PSGC with typing as the fallback, then the street.
 *
 * value: { province, provinceCode, municipalityId, municipalityName,
 *          municipalityCode, barangay, barangayCode, street }
 */
const PSGC_BASE = 'https://psgc.gitlab.io/api';
const cache = new Map();
const cachedFetch = async (url) => {
  if (cache.has(url)) return cache.get(url);
  const promise = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`PSGC ${res.status}`);
    return res.json();
  })();
  cache.set(url, promise);
  try {
    return await promise;
  } catch (err) {
    cache.delete(url);
    throw err;
  }
};

export const normalizeName = (s) => (s || '').toString().toLowerCase()
  .replace(/\s+city$/i, '').replace(/city of\s+/i, '').replace(/[^a-z0-9]+/gi, '').trim();

const SERVICE_REGION = { code: '170000000', name: 'MIMAROPA Region', shortName: 'MIMAROPA' };
export const SERVICE_PROVINCE = { code: '175200000', name: 'Oriental Mindoro' };
const MUNICIPALITIES = [
  ['175201000', 'Baco'], ['175202000', 'Bansud'], ['175203000', 'Bongabong'], ['175204000', 'Bulalacao'],
  ['175205000', 'Calapan City'], ['175206000', 'Gloria'], ['175207000', 'Mansalay'], ['175208000', 'Naujan'],
  ['175209000', 'Pinamalayan'], ['175210000', 'Pola'], ['175211000', 'Puerto Galera'], ['175212000', 'Roxas'],
  ['175213000', 'San Teodoro'], ['175214000', 'Socorro'], ['175215000', 'Victoria'],
].map(([code, name]) => ({ code, name }));

const listBarangays = async (code) => {
  if (!code) return [];
  let data = await cachedFetch(`${PSGC_BASE}/municipalities/${code}/barangays/`).catch(() => null);
  if (!data) data = await cachedFetch(`${PSGC_BASE}/cities/${code}/barangays/`).catch(() => []);
  return (data || []).map((b) => ({ code: b.code, name: b.name })).sort((a, b) => a.name.localeCompare(b.name));
};

const barangayKey = (name) => normalizeName(String(name || '').replace(/^(brgy\.?|bgy\.?|barangay)\s+/i, ''));

const emptyValue = {
  province: '', provinceCode: '', municipalityId: '', municipalityName: '', municipalityCode: '', barangay: '', barangayCode: '', street: '',
};

export default function ProfileAddressPicker({
  value, onChange, dbMunicipalities = [], dbLoading = false, errors = {}, lockTown = false, townHint = '',
  streetLabel = 'Street / House No.', streetPlaceholder = '123 Rizal St.',
}) {
  const v = { ...emptyValue, ...(value || {}) };
  const [barangays, setBarangays] = useState([]);
  const [barangaysFor, setBarangaysFor] = useState('');
  const [brgyLoading, setBrgyLoading] = useState(false);
  const [manualBarangay, setManualBarangay] = useState(false);

  const savedTown = v.municipalityName
    || (v.municipalityId && (dbMunicipalities || []).find((m) => m.id === v.municipalityId)?.name)
    || '';
  const townCode = (savedTown && MUNICIPALITIES.find((x) => normalizeName(x.name) === normalizeName(savedTown))?.code)
    || v.municipalityCode || '';

  // The province is fixed: a saved one from elsewhere clears the town and barangay.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.province, v.provinceCode]);

  useEffect(() => {
    if (!townCode) { setBarangays([]); setBarangaysFor(''); return undefined; }
    let cancelled = false;
    setBrgyLoading(true);
    listBarangays(townCode)
      .then((list) => { if (!cancelled) { setBarangays(list); setBarangaysFor(townCode); } })
      .catch(() => { if (!cancelled) { setBarangays([]); setManualBarangay(true); } })
      .finally(() => { if (!cancelled) setBrgyLoading(false); });
    return () => { cancelled = true; };
  }, [townCode]);

  const dbByName = useMemo(() => {
    const map = new Map();
    for (const m of dbMunicipalities || []) map.set(normalizeName(m.name), m);
    return map;
  }, [dbMunicipalities]);

  // The town's id, once the platform's list arrives.
  useEffect(() => {
    if (!v.municipalityName || v.municipalityId || dbByName.size === 0) return;
    const match = dbByName.get(normalizeName(v.municipalityName));
    if (match) onChange({ ...v, municipalityId: match.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbByName, v.municipalityName, v.municipalityId]);

  const listReady = Boolean(townCode) && barangaysFor === townCode && barangays.length > 0;
  const named = listReady && v.barangay ? barangays.find((b) => barangayKey(b.name) === barangayKey(v.barangay)) : null;
  const offList = listReady && Boolean(v.barangay) && !named;
  const typing = manualBarangay || offList;

  const toggleManual = () => {
    if (!typing) { setManualBarangay(true); return; }
    setManualBarangay(false);
    if (offList) onChange({ ...v, barangay: '', barangayCode: '' });
  };

  const pickTown = (code) => {
    const m = MUNICIPALITIES.find((x) => x.code === code);
    const db = m ? dbByName.get(normalizeName(m.name)) : null;
    onChange({ ...v, municipalityCode: code, municipalityName: m?.name || '', municipalityId: db?.id || '', barangay: '', barangayCode: '' });
  };

  const currentDb = dbByName.get(normalizeName(v.municipalityName));
  const unsupported = v.municipalityName && !currentDb && dbMunicipalities.length > 0;

  return (
    <View style={styles.picker}>
      <View style={styles.field}>
        <Text style={styles.label}>Province</Text>
        <TextInput style={[styles.input, styles.locked]} value={SERVICE_PROVINCE.name} editable={false} />
        <Text style={styles.hint}>We currently serve {SERVICE_PROVINCE.name} ({SERVICE_REGION.shortName}) only.</Text>
        {errors.province ? <Text style={styles.error}>{errors.province}</Text> : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>City / Municipality</Text>
        {lockTown ? (
          <TextInput style={[styles.input, styles.locked]} value={savedTown} editable={false} />
        ) : (
          <ProfileSelect
            title="City / Municipality"
            value={townCode}
            placeholder={dbLoading ? 'Loading municipalities…' : 'Select city / municipality'}
            disabled={dbLoading}
            error={Boolean(errors.municipality || errors.municipalityId)}
            options={MUNICIPALITIES.map((m) => {
              const ok = dbByName.has(normalizeName(m.name));
              const off = dbMunicipalities.length > 0 && !ok;
              return { value: m.code, label: `${m.name}${off ? ' (unavailable)' : ''}`, disabled: off };
            })}
            onChange={pickTown}
          />
        )}
        {lockTown && townHint ? <Text style={styles.hint}>{townHint}</Text> : null}
        {errors.municipality || errors.municipalityId ? <Text style={styles.error}>{errors.municipality || errors.municipalityId}</Text> : null}
        {unsupported ? <Text style={styles.note}>This city/municipality is not yet supported. Please choose a supported area.</Text> : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Barangay</Text>
        {!typing && barangays.length > 0 ? (
          <ProfileSelect
            title="Barangay"
            value={named?.code || ''}
            placeholder={brgyLoading ? 'Loading barangays…' : !townCode ? 'Select a municipality first' : 'Select barangay'}
            disabled={!townCode || brgyLoading}
            error={Boolean(errors.barangay)}
            options={barangays.map((b) => ({ value: b.code, label: b.name }))}
            onChange={(code) => onChange({ ...v, barangayCode: code, barangay: barangays.find((b) => b.code === code)?.name || '' })}
          />
        ) : (
          <TextInput
            style={[styles.input, errors.barangay && styles.inputError]}
            value={v.barangay || ''}
            onChangeText={(text) => onChange({ ...v, barangayCode: '', barangay: text })}
            placeholder={!townCode ? 'Select a municipality first' : brgyLoading ? 'Loading barangays…' : 'Enter barangay'}
            placeholderTextColor={t.neutral[500]}
          />
        )}
        {errors.barangay ? <Text style={styles.error}>{errors.barangay}</Text> : null}
        {townCode ? (
          <Pressable accessibilityRole="button" onPress={toggleManual} style={styles.toggle}>
            <Text style={styles.toggleText}>{typing ? 'Use dropdown' : 'Barangay not listed? Enter manually'}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{streetLabel}</Text>
        <TextInput
          style={[styles.input, errors.street && styles.inputError]}
          value={v.street || ''}
          onChangeText={(text) => onChange({ ...v, street: text })}
          placeholder={streetPlaceholder}
          placeholderTextColor={t.neutral[500]}
        />
        {errors.street ? <Text style={styles.error}>{errors.street}</Text> : null}
      </View>
    </View>
  );
}

/**
 * A <select> for phones: a field showing the choice, opening a sheet of
 * options. options: [{ value, label, disabled? }].
 */
export function ProfileSelect({ title, value, options, onChange, placeholder = 'Select…', disabled = false, error = false, style, textStyle }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.input, styles.select, disabled && styles.disabled, error && styles.inputError, style]}
      >
        <Text style={[styles.selectText, !selected && styles.placeholder, disabled && { color: t.neutral[500] }, textStyle]} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <CaretDownIcon size={16} weight="bold" color={t.neutral[700]} />
      </Pressable>
      <Sheet open={open} title={title} onClose={() => setOpen(false)}>
        {options.map((o) => (
          <SheetOption
            key={o.value}
            label={o.label}
            selected={o.value === value}
            onPress={o.disabled ? undefined : () => { onChange(o.value); setOpen(false); }}
            style={o.disabled ? { opacity: 0.45 } : undefined}
          />
        ))}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  picker: { gap: 12 },
  field: { gap: 4, minWidth: 0 },
  label: { fontSize: 13, lineHeight: 20.8, color: t.neutral[700], ...font(500) },
  input: {
    minHeight: 46, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: t.neutral[300], borderRadius: 10,
    backgroundColor: t.neutral[0], color: t.neutral[900], fontSize: 16, lineHeight: 24, ...font(400),
  },
  locked: { backgroundColor: t.neutral[50], color: t.neutral[700] },
  disabled: { backgroundColor: t.neutral[100] },
  inputError: { borderColor: t.danger[600] },
  select: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectText: { flex: 1, fontSize: 16, lineHeight: 24, color: t.neutral[900], ...font(400) },
  placeholder: { color: t.neutral[900] },
  hint: { fontSize: 12, lineHeight: 19.2, color: t.neutral[500], ...font(400) },
  error: { fontSize: 12, lineHeight: 19.2, color: t.danger[600], ...font(400) },
  note: { fontSize: 12, lineHeight: 19.2, color: t.warning[700], ...font(400) },
  toggle: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  toggleText: { fontSize: 13, lineHeight: 20.8, color: t.info[600], textDecorationLine: 'underline', ...font(400) },
});
