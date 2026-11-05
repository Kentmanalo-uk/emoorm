import { memo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Avatar from '../avatars/Avatar';
import { resolveImg, sizedImg } from '../../lib/media';
import { font } from '../../theme';

/*
 * The comments running up the bottom left of a live (the website's
 * components/live/LiveComments.jsx). Newest at the bottom; the list is
 * upside down so new ones push it up and a shopper scrolled back to read
 * stays where they are.
 */
function LiveComments({ comments, maxHeight = 240 }) {
  const data = [...comments].reverse();
  return (
    <FlatList
      inverted
      data={data}
      keyExtractor={(c) => c.id}
      style={[styles.list, { maxHeight }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      renderItem={({ item: c }) => (
        <View style={[styles.comment, c.seller && styles.seller]}>
          <View style={styles.avatar}>
            {/* The shop speaks as the shop: its logo. */}
            {c.seller && c.user?.logo
              ? <Image source={{ uri: sizedImg(c.user.logo, 22) || resolveImg(c.user.logo) }} style={styles.logo} />
              : <Avatar seed={c.user?.id} name={c.user?.avatarKey} size={22} />}
          </View>
          <Text style={styles.body}>
            <Text style={[styles.name, c.seller && styles.sellerName, c.mine && styles.mineName]}>{c.user?.name || 'Shopper'}</Text>
            {c.seller ? <Text>{' '}<Text style={styles.tag}>{' Seller '}</Text></Text> : null}
            {` ${c.text}`}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 0, width: '78%' },
  content: { gap: 6, paddingTop: 8 },
  comment: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  seller: { backgroundColor: 'rgba(5,93,7,0.72)' },
  avatar: { width: 22, height: 22, borderRadius: 11, overflow: 'hidden' },
  logo: { width: 22, height: 22, backgroundColor: '#fff' },
  body: {
    flexShrink: 1,
    color: '#fff',
    fontSize: 13.5,
    lineHeight: 18,
    ...font(400),
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  name: { color: '#ffe08a', ...font(600) },
  sellerName: { color: '#fff' },
  mineName: { color: '#9be7ff' },
  tag: { color: '#055d07', backgroundColor: '#fff', fontSize: 10.5, ...font(700) },
});

export default memo(LiveComments);
