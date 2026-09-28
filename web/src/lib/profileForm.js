import { API_CONFIG } from '../config/api';
import { beginActivity, endActivity } from './activity';

/**
 * Account settings: the checks and the photo upload shared by the Settings
 * page (computers) and its pages on phones.
 */

export const USERNAME_RE = /^[a-z0-9][a-z0-9._]{2,19}$/;

// Keep what the person types inside what the server will accept, so the
// only surprise left is "that username is taken" (409).
export const cleanUsername = (value) => value.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 20);

/** @returns {String|null} What is wrong with the name, or null */
export const fullNameProblem = (name) => (!name || name.trim().length < 2 ? 'Please enter your full name' : null);

/** @returns {String|null} What is wrong with the username, or null */
export const usernameProblem = (username) => (
  username && (!USERNAME_RE.test(username) || username.includes('..'))
    ? 'Username must be 3–20 characters: letters, numbers, dot or underscore'
    : null
);

/** @returns {String|null} What is wrong with the contact number (blank is allowed), or null */
export const contactProblem = (value) => {
  if (!value) return null;
  return /^09\d{9}$/.test(value.replace(/\D/g, '')) ? null : 'Contact number must be 11 digits starting with 09';
};

const PASSWORD_RULES = [
  { re: /.{8,}/, msg: 'Password must be at least 8 characters' },
  { re: /[A-Z]/, msg: 'Password must contain an uppercase letter' },
  { re: /[a-z]/, msg: 'Password must contain a lowercase letter' },
  { re: /[0-9]/, msg: 'Password must contain a number' },
  { re: /[!@#$%^&*(),.?":{}|<>]/, msg: 'Password must contain a special character' },
];

/**
 * @param {{ currentPassword: String, newPassword: String, confirmPassword: String }} pw
 * @returns {String|null} What is wrong with the password change, or null
 */
export const passwordProblem = ({ currentPassword, newPassword, confirmPassword }) => {
  if (!currentPassword || !newPassword || !confirmPassword) return 'Fill in all password fields';
  if (newPassword === currentPassword) return 'New password must be different from current password';
  if (newPassword !== confirmPassword) return 'New passwords do not match';
  return PASSWORD_RULES.find((r) => !r.re.test(newPassword))?.msg || null;
};

/**
 * Uploads a new profile photo.
 * @param {File} file
 * @returns {Promise<String>} The photo's URL
 */
export const uploadProfilePhoto = async (file) => {
  if (file.size > 5 * 1024 * 1024) throw new Error('Photo must be under 5 MB');
  if (!/^image\/(jpe?g|png|webp)$/.test(file.type)) throw new Error('Only JPEG, PNG, or WebP images allowed');
  const fd = new FormData();
  fd.append('file', file);
  // Use raw fetch so the browser sets multipart/form-data with a proper boundary.
  // (The shared axios instance defaults Content-Type: application/json, which breaks uploads.)
  const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
  beginActivity();
  let resp;
  let json;
  try {
    resp = await fetch(`${API_CONFIG.BASE_URL}/upload/image`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    json = await resp.json().catch(() => ({}));
  } finally {
    endActivity();
  }
  if (!resp.ok || !json?.success) {
    throw new Error(json?.message || `Upload failed (${resp.status})`);
  }
  const url = json?.data?.url;
  if (!url) throw new Error('Upload succeeded but no URL returned');
  return url;
};

/** The account's own address on one line: street, barangay, town. */
export const homeAddressLine = (user) => [user?.address, user?.barangay, user?.municipality?.name]
  .map((s) => String(s || '').trim())
  .filter(Boolean)
  .join(', ');
