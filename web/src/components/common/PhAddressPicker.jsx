import React, { useEffect, useMemo, useState } from 'react';
import {
  SERVICE_PROVINCE,
  SERVICE_REGION,
  listServiceMunicipalities,
  listBarangaysByMunicipality,
  normalizeName,
} from '../../lib/phAddress';
import './PhAddressPicker.css';

/**
 * Reusable Philippine address picker, scoped to the province the platform serves.
 *
 * Emits a `value` object shaped like:
 *   { province, provinceCode, municipalityId, municipalityName, municipalityCode,
 *     barangay, barangayCode, street }
 *
 * The province is fixed to Oriental Mindoro. E-MOORM only serves it, so asking
 * for it was a choice with one answer — and it cost a fetch of every province
 * in the country before the municipality list would load, which left the form
 * stuck on "Select a province first" whenever PSGC was slow. The emitted value
 * keeps the same shape, so nothing upstream has to know.
 *
 * Municipalities come from a fixed list (a province's municipalities do not
 * change), cross-referenced against the platform's own `municipalities`
 * catalogue (`dbMunicipalities`) so the emitted `municipalityId` is a valid FK.
 * Barangays still come from PSGC, with manual entry as the fallback.
 *
 * A saved address can be passed as it is stored (the town's name or id, the
 * barangay's name): the lists select by PSGC code, which the picker works out
 * from the names each time it renders, so a page resetting its form cannot
 * leave them blank. A barangay that is not on the list shows as typed.
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

// A barangay's name for comparing, without a typed "Brgy." or "Barangay" in front.
const barangayKey = (name) => normalizeName(String(name || '').replace(/^(brgy\.?|bgy\.?|barangay)\s+/i, ''));

const PhAddressPicker = ({
  value,
  onChange,
  dbMunicipalities = [],
  dbLoading = false,
  showStreet = true,
  errors = {},
  disabled = false,
  streetLabel = 'Street / House No.',
  streetPlaceholder = '123 Rizal St.',
  compact = false,
  // The town is set and cannot be changed here (an account's own town):
  // shown as a fixed field, with `townHint` under it.
  lockTown = false,
  townHint = '',
}) => {
  const v = { ...emptyValue, ...(value || {}) };

  const municipalities = useMemo(() => listServiceMunicipalities(), []);
  const [barangays, setBarangays] = useState([]);
  // The town the barangay list was loaded for.
  const [barangaysFor, setBarangaysFor] = useState('');
  const [brgyLoading, setBrgyLoading] = useState(false);
  const [manualBarangay, setManualBarangay] = useState(false);

  // The town selected on the list, from its name (or the id of a saved one).
  const savedTown = v.municipalityName
    || (v.municipalityId && (dbMunicipalities || []).find((m) => m.id === v.municipalityId)?.name)
    || '';
  const townCode = (savedTown && municipalities.find((x) => normalizeName(x.name) === normalizeName(savedTown))?.code)
    || v.municipalityCode
    || '';

  // Pin the province. For a fresh form this runs once (the consumers seed the
  // name but not the code). It runs again only if something upstream puts a
  // different province in — a record saved before the lock, say — and then
  // the municipality and barangay that belonged to it are cleared as well,
  // because they cannot be right.
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

  // Load barangays whenever municipality changes.
  useEffect(() => {
    if (!townCode) {
      setBarangays([]);
      setBarangaysFor('');
      return;
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

  // Resolve the municipality id once the platform catalogue arrives.
  //
  // The list of towns is a constant, so the dropdown is usable on first paint,
  // but `municipalityId` can only come from the catalogue the page fetches.
  // Someone picking a town before that request lands would end up with a
  // municipality plainly selected and no id behind it, and the form would
  // refuse to submit with "Municipality is required" pointing at a field that
  // looked filled in. Locally the fetch always won the race; over a real
  // network it does not.
  useEffect(() => {
    if (!v.municipalityName || v.municipalityId || dbMuniByNormName.size === 0) return;
    const match = dbMuniByNormName.get(normalizeName(v.municipalityName));
    if (match) onChange({ ...v, municipalityId: match.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbMuniByNormName, v.municipalityName, v.municipalityId]);

  // The barangay selected on the list, by name, once the town's barangays are in.
  const listReady = Boolean(townCode) && barangaysFor === townCode && barangays.length > 0;
  const namedBarangay = listReady && v.barangay
    ? barangays.find((b) => barangayKey(b.name) === barangayKey(v.barangay))
    : null;
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
    // Back to the list: a typed name on it is selected there, one it does
    // not have is cleared.
    if (offList) onChange({ barangay: '', barangayCode: '' });
  };

  const handleMunicipality = (e) => {
    const code = e.target.value;
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
  };

  const handleBarangay = (e) => {
    const code = e.target.value;
    const b = barangays.find((x) => x.code === code);
    onChange({ ...v, barangayCode: code, barangay: b?.name || '' });
  };

  const handleManualBarangay = (e) => {
    onChange({ ...v, barangayCode: '', barangay: e.target.value });
  };

  const handleStreet = (e) => {
    onChange({ ...v, street: e.target.value });
  };

  const currentDbMuni = dbMuniByNormName.get(normalizeName(v.municipalityName));
  const municipalityUnsupported =
    v.municipalityName && !currentDbMuni && dbMunicipalities.length > 0;

  return (
    <div className={`ph-address-picker ${compact ? 'compact' : ''}`}>
      <div className="ph-field">
        <label className="ph-label">Province</label>
        <input
          type="text"
          className={`ph-input ph-input-locked ${errors.province ? 'error' : ''}`}
          value={SERVICE_PROVINCE.name}
          readOnly
          aria-readonly="true"
          tabIndex={-1}
          title={`${SERVICE_PROVINCE.name}, ${SERVICE_REGION.shortName}`}
        />
        <span className="ph-hint">
          We currently serve {SERVICE_PROVINCE.name} ({SERVICE_REGION.shortName}) only.
        </span>
        {errors.province && <span className="ph-error">{errors.province}</span>}
      </div>

      <div className="ph-field">
        <label className="ph-label">City / Municipality</label>
        {lockTown ? (
          // Set once and kept: shown like the province, not as a choice.
          <input
            type="text"
            className="ph-input ph-input-locked"
            value={savedTown}
            readOnly
            aria-readonly="true"
            tabIndex={-1}
          />
        ) : (
          <select
            className={`ph-input ${errors.municipality || errors.municipalityId ? 'error' : ''}`}
            value={townCode}
            onChange={handleMunicipality}
            disabled={disabled || dbLoading}
          >
            <option value="">
              {dbLoading ? 'Loading municipalities…' : 'Select city / municipality'}
            </option>
            {municipalities.map((m) => {
              const supported = dbMuniByNormName.has(normalizeName(m.name));
              return (
                <option key={m.code} value={m.code} disabled={dbMunicipalities.length > 0 && !supported}>
                  {m.name}{dbMunicipalities.length > 0 && !supported ? ' (unavailable)' : ''}
                </option>
              );
            })}
          </select>
        )}
        {lockTown && townHint && <span className="ph-hint">{townHint}</span>}
        {(errors.municipality || errors.municipalityId) && (
          <span className="ph-error">{errors.municipality || errors.municipalityId}</span>
        )}
        {municipalityUnsupported && (
          <span className="ph-note">
            This city/municipality is not yet supported. Please choose a supported area.
          </span>
        )}
      </div>

      <div className="ph-field">
        <label className="ph-label">Barangay</label>
        {!typing && barangays.length > 0 ? (
          <select
            className={`ph-input ${errors.barangay ? 'error' : ''}`}
            value={barangayCode}
            onChange={handleBarangay}
            disabled={disabled || !townCode || brgyLoading}
          >
            <option value="">
              {brgyLoading
                ? 'Loading barangays…'
                : !townCode
                  ? 'Select a municipality first'
                  : 'Select barangay'}
            </option>
            {barangays.map((b) => (
              <option key={b.code} value={b.code}>{b.name}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            className={`ph-input ${errors.barangay ? 'error' : ''}`}
            value={v.barangay || ''}
            onChange={handleManualBarangay}
            placeholder="Enter barangay"
            disabled={disabled}
          />
        )}
        {errors.barangay && <span className="ph-error">{errors.barangay}</span>}
        {townCode && (
          <button
            type="button"
            className="ph-toggle-manual"
            onClick={toggleManual}
          >
            {typing ? 'Use dropdown' : "Barangay not listed? Enter manually"}
          </button>
        )}
      </div>

      {showStreet && (
        <div className="ph-field">
          <label className="ph-label">{streetLabel}</label>
          <input
            type="text"
            className={`ph-input ${errors.street ? 'error' : ''}`}
            value={v.street || ''}
            onChange={handleStreet}
            placeholder={streetPlaceholder}
            disabled={disabled}
          />
          {errors.street && <span className="ph-error">{errors.street}</span>}
        </div>
      )}
    </div>
  );
};

export default PhAddressPicker;
