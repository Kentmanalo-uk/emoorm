import LegalDocument from '../src/components/public/LegalDocument';

// web/src/pages/TermsOfService.jsx
const MAIL = { link: 'support@emoorm.shop', to: 'mailto:support@emoorm.shop' };

const BLOCKS = [
  { p: 'These Terms govern your use of the Emoorm website and mobile app (the "Platform"). By creating an account or using the Platform, you agree to these Terms.' },

  { h2: 'What Emoorm is' },
  { p: "Emoorm is a marketplace that lets independent sellers in Oriental Mindoro list products, and lets buyers browse and place orders with those sellers. Emoorm is not the seller of the products listed on the Platform, and does not manufacture, inspect, or take possession of sellers' goods." },

  { h2: 'Accounts' },
  { ul: [
    'You must provide accurate information when registering and keep it up to date.',
    'You are responsible for keeping your password and account access secure.',
    'You must be able to enter into a binding contract to use the Platform.',
    'Selling on Emoorm requires an approved seller application, reviewed by a municipal or platform administrator.',
  ] },

  { h2: 'Orders and payment' },
  { p: "Emoorm does not process, hold, or guarantee payments. When you place an order, payment (Cash on Delivery, GCash, or a seller's own QR e-wallet, depending on what that seller accepts) is made directly between you and the seller. Emoorm is not a party to that payment and is not responsible for payment disputes, refunds, or chargebacks — these are arranged directly between buyer and seller." },
  { p: 'Sellers are responsible for the accuracy of their own product listings (description, price, stock, and images) and for fulfilling orders they accept.' },

  { h2: 'Seller responsibilities' },
  { ul: [
    'List only products you are authorized to sell and accurately describe them.',
    'Keep stock levels and order statuses up to date.',
    'Comply with applicable Philippine consumer protection and food safety laws.',
    'Respond to buyer messages and orders in good faith.',
  ] },

  { h2: 'Prohibited conduct' },
  { ul: [
    'Listing illegal, counterfeit, or prohibited items.',
    'Posting false, misleading, or fraudulent listings or reviews.',
    'Harassing, threatening, or abusing other users.',
    'Attempting to bypass, disrupt, or gain unauthorized access to the Platform.',
  ] },

  { h2: 'Content and reviews' },
  { p: 'You retain ownership of the text, images, and reviews you submit, but you grant Emoorm a license to display that content on the Platform so other users can see it. You are responsible for content you submit and for having the rights to any images you upload.' },

  { h2: 'Moderation and suspension' },
  { p: 'Administrators may review, hide, or remove listings, reviews, or accounts that violate these Terms or applicable law, and may suspend a store or account pending review of a report.' },

  { h2: 'Disclaimer and limitation of liability' },
  { p: 'The Platform is provided "as is." Emoorm does not guarantee that products listed by sellers will be available, accurately described, or delivered on time, and is not liable for losses arising from transactions between buyers and sellers. To the extent permitted by law, Emoorm\'s liability for any claim relating to the Platform is limited to helping facilitate communication between the parties involved.' },

  { h2: 'Changes to these Terms' },
  { p: 'We may update these Terms as the Platform evolves. Continued use of the Platform after an update means you accept the revised Terms.' },

  { h2: 'Governing law' },
  { p: 'These Terms are governed by the laws of the Republic of the Philippines.' },

  { h2: 'Contact us' },
  { p: ['Questions about these Terms can be sent to ', MAIL, ', or visit our ', { link: 'Help Centre', to: '/help-center' }, '.'] },
];

export default function TermsOfService() {
  return <LegalDocument title="Terms of Service" updated="Last updated: August 2026" blocks={BLOCKS} />;
}
