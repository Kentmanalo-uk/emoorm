import { PartLoading, ProfilePart, useFreshAccount } from '../src/components/profile/SettingsParts';

/**
 * /profile/settings/profile (web ProfileSettingsPhone.jsx, the Name & photo
 * part): the name, username and photo, with Cancel and Save changes.
 */
export default function EditProfile() {
  const fresh = useFreshAccount();
  return fresh ? <ProfilePart /> : <PartLoading part="profile" />;
}
