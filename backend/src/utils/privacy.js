/**
 * Masks for what admins see of people's details. Admins moderate the
 * marketplace; they do not need a buyer's phone, a seller's payout number or
 * someone's street to do that. Where a case does need one, the admin asks to
 * see it with a reason and it is written to the audit log (the reveal
 * endpoints); everywhere else these masks are what leave the server.
 */

/** "09171234567" → "0917 ••• 4567" */
const maskPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length < 7) return '•••';
  return `${digits.slice(0, 4)} ••• ${digits.slice(-4)}`;
};

/** "juan.delacruz@gmail.com" → "ju•••@gmail.com" */
const maskEmail = (value) => {
  const text = String(value || '');
  const at = text.indexOf('@');
  if (at < 1) return text ? '•••' : null;
  return `${text.slice(0, Math.min(2, at))}•••${text.slice(at)}`;
};

/** Account / ID numbers: only the last four digits. "123456789012" → "•••• 9012" */
const maskNumber = (value) => {
  const text = String(value || '').replace(/\s+/g, '');
  if (!text) return null;
  return `•••• ${text.slice(-4)}`;
};

/** An IP address: the network part only. "203.177.12.45" → "203.177.•.•" */
const maskIp = (value) => {
  const text = String(value || '');
  if (!text) return null;
  if (text.includes('.')) return text.split('.').slice(0, 2).concat(['•', '•']).join('.');
  if (text.includes(':')) return `${text.split(':').slice(0, 2).join(':')}:•••`;
  return '•••';
};

/** Where someone is, without the street: "Brgy. Poblacion, Bansud". */
const areaOnly = (barangay, municipalityName) => [barangay, municipalityName].filter(Boolean).join(', ') || null;

module.exports = {
  maskPhone, maskEmail, maskNumber, maskIp, areaOnly,
};
