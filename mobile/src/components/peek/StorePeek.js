import { Share, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowSquareOutIcon, ChatCircleTextIcon, MapPinIcon, PackageIcon, ShareNetworkIcon, UserPlusIcon,
} from '../../lib/icons';
import { t, themed } from '../../theme';
import useAuthStore from '../../store/authStore';
import { toast } from '../../lib/toast';
import StoreListLogo from '../shop/StoreListLogo';
import ShopTileImage from '../shop/ShopTileImage';
import { followStore, getFollowStatus } from '../product/productLib';
import { PeekBody, peekProps, peekText } from '../Peek';

/*
 * A shop's long-press preview: logo, name, town and product count, what the
 * shop says about itself and a few of its products, with Visit shop, Chat,
 * Follow and Share under it.
 *
 *   const peekStore = useStorePeek();
 *   <Pressable onPress={open} {...peekStore(store, { onOpen: open, extra })}>
 *
 * `follow: false` leaves out Follow (the followed-shops page has its own).
 */

const SITE = 'https://emoorm.shop';

export function useStorePeek() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (store, { onOpen, extra = [], follow = true } = {}) => peekProps(() => {
    if (!store?.slug) return null;
    const open = onOpen || (() => router.push(`/store/${store.slug}`));
    const signIn = () => router.push(`/login?redirect=${encodeURIComponent(`/store/${store.slug}`)}`);

    const chat = () => {
      if (!isAuthenticated) { signIn(); return; }
      router.push({ pathname: '/messages', params: { store: store.id } });
    };
    const followIt = async () => {
      if (!isAuthenticated) { signIn(); return; }
      try {
        const status = await getFollowStatus(store.id).catch(() => null);
        if (status?.following) { toast.info(`You already follow ${store.name}`); return; }
        await followStore(store.id);
        toast.success(`You now follow ${store.name}`);
      } catch (err) {
        toast.error(err.message || 'Could not follow this shop');
      }
    };
    const share = async () => {
      try {
        const url = `${SITE}/store/${store.slug}`;
        await Share.share({ title: store.name, message: `${store.name} on E-MOORM ${url}`, url });
      } catch {
        // Closing the share menu needs no message.
      }
    };

    return {
      content: <StorePeekCard store={store} />,
      onOpen: open,
      actions: [
        { key: 'open', label: 'Visit shop', Icon: ArrowSquareOutIcon, onPress: open },
        store.id ? { key: 'chat', label: 'Chat with shop', Icon: ChatCircleTextIcon, onPress: chat } : null,
        follow && store.id ? { key: 'follow', label: 'Follow shop', Icon: UserPlusIcon, onPress: followIt } : null,
        { key: 'share', label: 'Share', Icon: ShareNetworkIcon, onPress: share },
        ...extra,
      ],
    };
  });
}

/** The preview itself. */
export function StorePeekCard({ store }) {
  const count = store._count?.products ?? store.productCount ?? null;
  const town = store.municipality?.name;
  const products = (store.products || []).slice(0, 3);
  return (
    <View>
      <View style={styles.head}>
        <StoreListLogo store={store} style={styles.logo} />
        <View style={styles.headText}>
          <Text style={peekText.title} numberOfLines={2}>{store.name}</Text>
          <View style={styles.meta}>
            {town ? (
              <View style={styles.metaItem}>
                <MapPinIcon size={13} weight="fill" color={t.primary[600]} />
                <Text style={peekText.sub}>{town}</Text>
              </View>
            ) : null}
            {count != null ? (
              <View style={styles.metaItem}>
                <PackageIcon size={13} weight="fill" color={t.primary[600]} />
                <Text style={peekText.sub}>{count} {count === 1 ? 'product' : 'products'}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
      {store.description || products.length ? (
        <PeekBody style={styles.body}>
          {store.description ? <Text style={peekText.body} numberOfLines={5}>{store.description}</Text> : null}
          {products.length ? (
            <View style={styles.products}>
              {products.map((p) => (
                <View key={p.id} style={styles.product}>
                  <ShopTileImage src={Array.isArray(p.images) ? p.images[0] : p.images} />
                </View>
              ))}
            </View>
          ) : null}
        </PeekBody>
      ) : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  logo: { width: 64, height: 64, borderRadius: 16 },
  headText: { flex: 1, minWidth: 0, gap: 4 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  body: { paddingTop: 0, gap: 12 },
  products: { flexDirection: 'row', gap: 8 },
  product: { flex: 1, aspectRatio: 1, overflow: 'hidden', borderRadius: 12, backgroundColor: t.neutral[100] },
}));
