import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  CalendarBlankIcon, DatabaseIcon, EnvelopeSimpleIcon, HouseIcon, LockKeyIcon, MapPinIcon, PhoneIcon, ShieldCheckIcon,
  UserCircleIcon,
} from 'phosphor-react-native';
import apiClient from '../src/api/client';
import ScreenHeader from '../src/components/ScreenHeader';
import CartConfirmDialog from '../src/components/cart/CartConfirmDialog';
import useAuthStore from '../src/store/authStore';
import { PfSection, PfTitle, SettingsList, SettingsRow, SignOutRow } from '../src/components/profile/ProfileUI';
import {
  AddressPart, ContactPart, DataPart, PartLoading, PasswordPart, ProfilePart, useFreshAccount,
} from '../src/components/profile/SettingsParts';
import { fetchIdentityStatus, homeAddressLine, longDate } from '../src/components/profile/profileLib';
import { t } from '../src/theme';

const IDENTITY_VALUES = {
  VERIFIED: 'Verified',
  PENDING: 'We are checking your ID',
  FAILED: 'Not verified yet · Try again',
  NOT_VERIFIED: 'Not verified yet',
};

const PART_PAGES = { profile: ProfilePart, contact: ContactPart, address: AddressPart, password: PasswordPart, data: DataPart };

/**
 * /profile/settings on phones (web/src/pages/ProfileSettingsPhone.jsx): the
 * account's parts as lists showing what is set now; each part opens a page of
 * its own (/settings?part=<part>, the website's /profile/settings/<part>;
 * Name & photo is /edit-profile). Delivery addresses and the ID check keep
 * their own pages.
 */
export default function SettingsScreen() {
  const { part } = useLocalSearchParams();
  const fresh = useFreshAccount();
  const Page = part ? PART_PAGES[part] : null;
  if (Page) return fresh ? <Page /> : <PartLoading part={part} />;
  return <SettingsHub />;
}

function SettingsHub() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [addresses, setAddresses] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [signOutOpen, setSignOutOpen] = useState(false);

  useEffect(() => {
    let live = true;
    apiClient.get('/addresses')
      .then((res) => { if (live) setAddresses(res.data || []); })
      .catch(() => { if (live) setAddresses([]); });
    fetchIdentityStatus()
      .then((res) => { if (live) setIdentity(res || { status: 'NOT_VERIFIED' }); })
      .catch(() => { if (live) setIdentity({ status: 'NOT_VERIFIED' }); });
    return () => { live = false; };
  }, []);

  const open = (to) => router.push(to);
  const home = homeAddressLine(user);
  const defaultAddress = addresses && (addresses.find((a) => a.isDefault) || addresses[0]);
  const delivery = addresses === null
    ? 'Loading…'
    : defaultAddress
      ? [
        defaultAddress.label,
        [defaultAddress.street, defaultAddress.barangay, defaultAddress.municipality?.name].filter(Boolean).join(', '),
      ].filter(Boolean).join(' · ') + (addresses.length > 1 ? ` (+${addresses.length - 1} more)` : '')
      : 'Add where your orders go';
  const idStatus = identity?.status || 'NOT_VERIFIED';
  const idNeeded = identity && idStatus !== 'VERIFIED' && idStatus !== 'PENDING';

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Account Settings" backTo="/profile" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <PfSection list>
          <PfTitle list>Profile</PfTitle>
          <SettingsList>
            <SettingsRow
              onPress={() => open('/edit-profile')}
              Icon={UserCircleIcon}
              label="Name & photo"
              value={[user?.fullName, user?.username && `@${user.username}`].filter(Boolean).join(' · ')}
            />
            <SettingsRow Icon={EnvelopeSimpleIcon} label="Email" value={user?.email || '—'} />
            <SettingsRow
              onPress={() => open('/settings?part=contact')}
              Icon={PhoneIcon}
              label="Contact number"
              value={user?.contactNumber || 'Add your number'}
              missing={!user?.contactNumber}
            />
            <SettingsRow
              onPress={() => open('/settings?part=address')}
              Icon={HouseIcon}
              label="Home address"
              value={home || 'Add your address'}
              missing={!user?.barangay || !user?.address}
            />
          </SettingsList>
        </PfSection>

        {/* Where orders go: a card of its own, apart from the account's address. */}
        <PfSection list>
          <PfTitle list>Delivery addresses</PfTitle>
          <SettingsRow
            onPress={() => open('/addresses')}
            Icon={MapPinIcon}
            label={defaultAddress ? 'Default address' : 'My addresses'}
            value={delivery}
            missing={addresses !== null && !defaultAddress}
          />
        </PfSection>

        <PfSection list>
          <PfTitle list>Security</PfTitle>
          <SettingsList>
            <SettingsRow
              onPress={() => open('/verification')}
              Icon={ShieldCheckIcon}
              label="Verify your identity"
              value={identity ? IDENTITY_VALUES[idStatus] || IDENTITY_VALUES.NOT_VERIFIED : 'Loading…'}
              missing={Boolean(idNeeded)}
              tag={idNeeded && identity?.requiredForCheckout !== false ? 'Needed to check out' : null}
            />
            <SettingsRow onPress={() => open('/settings?part=password')} Icon={LockKeyIcon} label="Password" value="Change your password" />
          </SettingsList>
        </PfSection>

        <PfSection list>
          <PfTitle list>Account</PfTitle>
          <SettingsList>
            <SettingsRow Icon={CalendarBlankIcon} label="Member since" value={longDate(user?.createdAt)} />
            <SettingsRow onPress={() => open('/settings?part=data')} Icon={DatabaseIcon} label="Your data" value="Download a copy, or delete your account" />
          </SettingsList>
        </PfSection>

        <SignOutRow onPress={() => setSignOutOpen(true)} />
      </ScrollView>

      <CartConfirmDialog
        open={signOutOpen}
        title="Log out?"
        message="You will need to log in again to place orders and see your account."
        confirmLabel="Log out"
        danger
        onConfirm={async () => { setSignOutOpen(false); await logout(); router.replace('/profile'); }}
        onCancel={() => setSignOutOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  content: { gap: 12, paddingTop: 24, paddingBottom: 16 },
});
