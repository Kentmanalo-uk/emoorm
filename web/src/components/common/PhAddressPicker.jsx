import React, { useEffect, useMemo, useState } from 'react';
import {
  listProvinces,
  listMunicipalitiesByProvince,
  listBarangaysByMunicipality,
  matchPsgcMunicipality,
  normalizeName,
} from '../../lib/phAddress';
import './PhAddressPicker.css';

/**
 * Reusable Philippine address picker.
 *
 * Emits a `value` object shaped like:
 *   { province, provinceCode, municipalityId, municipalityName, municipalityCode,
 *     barangay, barangayCode, street }
 *
 * The picker cross-references PSGC municipalities against the platform's DB
 * `municipalities` list (passed in via `dbMunicipalities`) so the emitted
 * `municipalityId` remains a valid FK for the backend. Provinces not covered
 * by the platform are still selectable but marked as unavailable.
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

  const [provinces, setProvinces] = useState([]);
  const [provincesLoading, setProvincesLoading] = useState(true);
  const [municipalities, setMunicipalities] = useState([]);
  const [muniLoading, setMuniLoading] = useState(false);
  const [barangays, setBarangays] = useState([]);
  const [brgyLoading, setBrgyLoading] = useState(false);
  const [manualBarangay, setManualBarangay] = useState(false);

  // Load provinces once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listProvinces();
        if (!cancelled) setProvinces(list);
      } catch {
        if (!cancelled) setProvinces([]);
      } finally {
        if (!cancelled) setProvincesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Resolve initial province code from name when only the name is present.
  useEffect(() => {
    if (!v.provinceCode && v.province && provinces.length > 0) {
      const target = normalizeName(v.province);
      const match = provinces.find((p) => normalizeName(p.name) === target);
      if (match) onChange({ ...v, provinceCode: match.code });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provinces, v.province]);

  // Load PSGC municipalities/cities whenever province changes.
  useEffect(() => {
    if (!v.provinceCode) {
      setMunicipalities([]);
      return;
    }
    let cancelled = false;
    setMuniLoading(true);
    (async () => {
      try {
        const list = await listMunicipalitiesByProvince(v.provinceCode);
        if (!cancelled) setMunicipalities(list);
      } catch {
        if (!cancelled) setMunicipalities([]);
      } finally {
        if (!cancelled) setMuniLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [v.provinceCode]);

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

  const psgcMunicipalitiesForCurrentProvince = municipalities;

  const handleProvince = (e) => {
    const code = e.target.value;
    const p = provinces.find((x) => x.code === code);
    onChange({
      ...v,
      province: p?.name || '',
      provinceCode: code,
      municipalityId: '',
      municipalityName: '',
      municipalityCode: '',
      barangay: '',
      barangayCode: '',
    });
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
  const provinceUnavailable =
    v.provinceCode &&
    !provincesLoading &&
    !muniLoading &&
    municipalities.length > 0 &&
    !municipalities.some((m) => dbMuniByNormName.has(normalizeName(m.name)));

  const municipalityUnsupported =
    v.municipalityName && !currentDbMuni && dbMunicipalities.length > 0;

  return (
    <div className={`ph-address-picker ${compact ? 'compact' : ''}`}>
      <div className="ph-field">
        <label className="ph-label">Province</label>
        <select
          className={`ph-input ${errors.province ? 'error' : ''}`}
          value={v.provinceCode || ''}
          onChange={handleProvince}
          disabled={disabled || provincesLoading}
        >
          <option value="">{provincesLoading ? 'Loading provinces…' : 'Select province'}</option>
          {provinces.map((p) => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
        </select>
        {errors.province && <span className="ph-error">{errors.province}</span>}
        {provinceUnavailable && (
          <span className="ph-note">This province is not yet served by the platform.</span>
        )}
      </div>

      <div className="ph-field">
        <label className="ph-label">City / Municipality</label>
        <select
          className={`ph-input ${errors.municipality || errors.municipalityId ? 'error' : ''}`}
          value={v.municipalityCode || ''}
          onChange={handleMunicipality}
          disabled={disabled || !v.provinceCode || muniLoading}
        >
          <option value="">
            {muniLoading
              ? 'Loading…'
              : !v.provinceCode
                ? 'Select a province first'
                : 'Select city / municipality'}
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
