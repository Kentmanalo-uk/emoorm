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

const PhAddressPicker = ({
  value,
  onChange,
  dbMunicipalities = [],
  showStreet = true,
  errors = {},
  disabled = false,
  streetLabel = 'Street / House No.',
  streetPlaceholder = '123 Rizal St.',
  compact = false,
}) => {
  const v = { ...emptyValue, ...(value || {}) };

  const municipalities = useMemo(() => listServiceMunicipalities(), []);
  const [barangays, setBarangays] = useState([]);
  const [brgyLoading, setBrgyLoading] = useState(false);
  const [manualBarangay, setManualBarangay] = useState(false);

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
    if (!v.municipalityCode) {
      setBarangays([]);
      return;
    }
    let cancelled = false;
    setBrgyLoading(true);
    (async () => {
      try {
        const list = await listBarangaysByMunicipality(v.municipalityCode);
        if (!cancelled) setBarangays(list);
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
  }, [v.municipalityCode]);

  const dbMuniByNormName = useMemo(() => {
    const map = new Map();
    for (const m of dbMunicipalities || []) map.set(normalizeName(m.name), m);
    return map;
  }, [dbMunicipalities]);

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
        <select
          className={`ph-input ${errors.municipality || errors.municipalityId ? 'error' : ''}`}
          value={v.municipalityCode || ''}
          onChange={handleMunicipality}
          disabled={disabled}
        >
          <option value="">Select city / municipality</option>
          {municipalities.map((m) => {
            const supported = dbMuniByNormName.has(normalizeName(m.name));
            return (
              <option key={m.code} value={m.code} disabled={dbMunicipalities.length > 0 && !supported}>
                {m.name}{dbMunicipalities.length > 0 && !supported ? ' (unavailable)' : ''}
              </option>
            );
          })}
        </select>
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
        {!manualBarangay && barangays.length > 0 ? (
          <select
            className={`ph-input ${errors.barangay ? 'error' : ''}`}
            value={v.barangayCode || ''}
            onChange={handleBarangay}
            disabled={disabled || !v.municipalityCode || brgyLoading}
          >
            <option value="">
              {brgyLoading
                ? 'Loading barangays…'
                : !v.municipalityCode
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
        {v.municipalityCode && (
          <button
            type="button"
            className="ph-toggle-manual"
            onClick={() => setManualBarangay((m) => !m)}
          >
            {manualBarangay ? 'Use dropdown' : "Barangay not listed? Enter manually"}
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
