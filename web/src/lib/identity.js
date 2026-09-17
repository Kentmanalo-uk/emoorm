import axios from './axios';

export const IDENTITY_VERIFICATION_PATH = '/profile/verification';

export const IDENTITY_REQUIRED_MESSAGE =
  'Identity verification required. Please verify your identity before checking out.';

export const fetchIdentityStatus = async () => {
  const res = await axios.get('/identity-verification');
  return res.data;
};

export const submitIdentityVerification = async (idType, file) => {
  const form = new FormData();
  form.append('idType', idType);
  form.append('idImage', file);
  const res = await axios.post('/identity-verification', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
  return res.data;
};

// The backend is the source of truth; this recognises its checkout rejection.
export const isIdentityRequiredError = (error) =>
  Array.isArray(error?.errors)
  && error.errors.some((item) => item?.code === 'IDENTITY_VERIFICATION_REQUIRED');
