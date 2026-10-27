// Inside the Philippines: anything else (0,0 from an unset pin) is no pin.
export const validPin = (lat, lng) => {
  const a = Number(lat);
  const b = Number(lng);
  return lat !== null && lat !== undefined && lat !== '' && Number.isFinite(a) && Number.isFinite(b)
    && a >= 4 && a <= 22 && b >= 116 && b <= 127;
};

export default validPin;
