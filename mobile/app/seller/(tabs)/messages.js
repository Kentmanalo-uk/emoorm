import SellerPage from '../../../src/components/seller/SellerPage';
import { SellerChatHeader } from '../../../src/components/seller/SellerTopBars';
import SellerMessages from '../../../src/components/SellerMessages';

// /seller/messages (Chat). STUB: the bar is done (SellerChatHeader: "Chat
// [Buyers ▾]", Ate Moormy, bell, ⋯). Port the body from
// web/src/pages/SellerMessages.jsx + SellerApp.css (.seller-chat-card); until
// then the app's older conversation list keeps the page useful.
export default function SellerChatScreen() {
  return (
    <SellerPage header={<SellerChatHeader />} scroll={false}>
      <SellerMessages />
    </SellerPage>
  );
}
