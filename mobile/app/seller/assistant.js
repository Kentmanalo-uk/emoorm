import { NotePencilIcon } from 'phosphor-react-native';
import SellerPage from '../../src/components/seller/SellerPage';
import SellerPlaceholder from '../../src/components/seller/SellerPlaceholder';
import { SellerHeaderButton } from '../../src/components/seller/SellerTopBars';
import { t } from '../../src/theme';

// /seller/assistant (Ate Moormy). STUB: the bar is done (back, "Ate Moormy",
// New chat, ⋯). Port the body from web/src/pages/SellerAssistant.jsx and wire
// New chat (the website fires 'moormy:new-chat').
export default function SellerAssistantScreen() {
  return (
    <SellerPage
      action={(
        <SellerHeaderButton label="New chat" onPress={() => {}} style={{ marginRight: 6 }}>
          <NotePencilIcon size={20} color={t.neutral[700]} />
        </SellerHeaderButton>
      )}
    >
      <SellerPlaceholder source="web/src/pages/SellerAssistant.jsx" />
    </SellerPage>
  );
}
