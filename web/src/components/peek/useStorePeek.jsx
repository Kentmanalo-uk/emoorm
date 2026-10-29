import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowSquareOut, ChatCircleText, ShareNetwork, UserPlus,
} from '../../lib/icons';
import useAuthStore from '../../store/authStore';
import { followStore, getFollowStatus } from '../../lib/follow';
import { peekProps, sharePeek } from './peekCore';
import { StorePeekCard } from './PeekCards';

/*
 * A shop's long-press preview: logo, name, town and product count, what the
 * shop says about itself and a few of its products, with Visit shop, Chat,
 * Follow and Share under it.
 *
 *   const peekStore = useStorePeek();
 *   <Link to={…} {...peekStore(store)}>
 *
 * `follow: false` leaves out Follow (the followed-shops page has its own).
 */

export default function useStorePeek() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (store, { onOpen, extra = [], follow = true } = {}) => peekProps(() => {
    if (!store?.slug) return null;
    const page = `/store/${store.slug}`;
    const open = onOpen || (() => navigate(page));
    const signIn = () => navigate(`/login?redirect=${encodeURIComponent(page)}`);

    const chat = () => {
      if (!isAuthenticated) { signIn(); return; }
      navigate(`/messages?store=${store.id}`);
    };
    const followIt = async () => {
      if (!isAuthenticated) { signIn(); return; }
      try {
        const status = await getFollowStatus(store.id).catch(() => null);
        if (status?.following) { toast(`You already follow ${store.name}`); return; }
        await followStore(store.id);
        toast.success(`You now follow ${store.name}`);
      } catch (err) {
        toast.error(err.message || 'Could not follow this shop');
      }
    };
    const share = () => sharePeek({
      title: store.name,
      text: `${store.name} on E-MOORM`,
      url: `${window.location.origin}${page}`,
    });

    return {
      label: store.name,
      content: <StorePeekCard store={store} />,
      onOpen: open,
      actions: [
        { key: 'open', label: 'Visit shop', Icon: ArrowSquareOut, onClick: open },
        store.id ? { key: 'chat', label: 'Chat with shop', Icon: ChatCircleText, onClick: chat } : null,
        follow && store.id ? { key: 'follow', label: 'Follow shop', Icon: UserPlus, onClick: followIt } : null,
        { key: 'share', label: 'Share', Icon: ShareNetwork, onClick: share },
        ...extra,
      ],
    };
  });
}
