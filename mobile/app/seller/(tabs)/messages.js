import SellerPage from '../../../src/components/seller/SellerPage';
import { SellerChatHeader } from '../../../src/components/seller/SellerTopBars';
import SellerMessages from '../../../src/components/SellerMessages';

// /seller/messages (Chat): web/src/pages/SellerMessages.jsx on phones. The bar is
// SellerChatHeader ("Chat [Buyers ▾]", Ate Moormy, bell, ⋯); the list scrolls with
// its tip, search and chips, so it shows the "Private until approved" line itself.
export default function SellerChatScreen() {
  return (
    <SellerPage header={<SellerChatHeader />} scroll={false} privateLine={false}>
      <SellerMessages />
    </SellerPage>
  );
}
