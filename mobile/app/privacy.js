import LegalDocument from '../src/components/public/LegalDocument';

// web/src/pages/PrivacyPolicy.jsx
const MAIL = { link: 'support@emoorm.shop', to: 'mailto:support@emoorm.shop' };

const BLOCKS = [
  { p: 'This Privacy Policy explains what information Emoorm collects when you use our website and mobile app, and how that information is used. It applies to buyers, sellers, and administrators on the platform.' },

  { h2: 'Information we collect' },
  { p: 'When you create an account, we collect:' },
  { ul: [
    'Your name, email address, and password (stored in encrypted/hashed form).',
    'Your contact number, municipality, barangay, and address, where you provide them.',
    'A profile photo, if you choose to upload one.',
  ] },
  { p: 'If you apply to sell on Emoorm, we additionally collect:' },
  { ul: [
    'Your shop name, shop description, and shop address.',
    'A government-issued ID (front and back) and a selfie photo, used only to verify seller applications.',
  ] },
  { p: 'When you use the platform, we also store:' },
  { ul: [
    'Products you list, order, review, message about, or add to your cart/wishlist.',
    'Order details such as items purchased, delivery/pickup address, and order status.',
    'Messages you send through the in-app messaging feature between buyers and sellers.',
  ] },

  { h2: 'What we do not collect' },
  { p: "Emoorm does not process or store payment card details. Payments (Cash on Delivery, GCash, or a seller's own QR e-wallet) are made directly between the buyer and the seller, outside of the platform. We do not collect precise GPS location — only the municipality, barangay, and address text you provide." },

  { h2: 'How we use your information' },
  { ul: [
    'To create and manage your account and let you sign in.',
    'To let you browse, order, sell, message, and review products and stores.',
    'To review and approve seller applications and product listings.',
    'To send account-related emails, such as password reset links and order updates.',
    'To investigate reports of abuse, fraud, or policy violations.',
  ] },

  { h2: 'Sharing your information' },
  { p: 'Your name and, where relevant, contact number and delivery address are shared with the seller (or buyer) of an order so that it can be fulfilled. Your seller verification documents (ID and selfie) are only visible to municipal and platform administrators reviewing your application. We do not sell your personal information to third parties.' },
  { p: "If you choose to sign in with Google, Google will share your basic account information (name and email) with Emoorm, in line with Google's own privacy practices." },

  { h2: 'Data retention and your choices' },
  { p: 'We keep your account information for as long as your account is active. You can update your profile information at any time from your account settings. To request deletion of your account or data, contact us using the details below.' },

  { h2: 'Security' },
  { p: 'We take reasonable technical measures to protect your information, including password hashing and access controls on administrator accounts. No online service can guarantee perfect security, so please use a strong, unique password for your account.' },

  { h2: 'Philippine Data Privacy Act' },
  { p: 'We aim to handle personal information in a manner consistent with the Data Privacy Act of 2012 (Republic Act No. 10173) of the Philippines. This policy may be updated from time to time as our services evolve.' },

  { h2: 'Contact us' },
  { p: ['Questions about this policy or your data can be sent to ', MAIL, ', or visit our ', { link: 'Help Centre', to: '/help-center' }, '.'] },
];

export default function PrivacyPolicy() {
  return <LegalDocument title="Privacy Policy" updated="Last updated: August 2026" blocks={BLOCKS} />;
}
