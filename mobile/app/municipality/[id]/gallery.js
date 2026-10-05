import { useEffect, useState } from 'react';
import {
  Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeftIcon, MapPinIcon } from 'phosphor-react-native';
import apiClient from '../../../src/api/client';
import EmptyArt from '../../../src/components/EmptyArt';
import PublicHeader from '../../../src/components/public/PublicHeader';
import { MunicipalitySeal } from '../../../src/components/public/MunicipalityParts';
import { resolveImg } from '../../../src/lib/media';
import { font, t, text } from '../../../src/theme';

/*
 * web/src/pages/MunicipalityGallery.jsx + MunicipalityGallery.css at phone
 * width. "<Town> Gallery" is the page's h1, moved up into the back bar.
 */

const GUTTER = 12;
const GAP = 8;

export default function MunicipalityGallery() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [municipality, setMunicipality] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiClient.get(`/municipalities/${id}`)
      .then((response) => { if (!cancelled) setMunicipality(response.data); })
      .catch(() => { })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const gallery = Array.isArray(municipality?.gallery) ? municipality.gallery : [];
  // Two 4:3 columns; the first photo spans both.
  const full = Math.min(width, 768) - GUTTER * 2;
  const half = (full - GAP) / 2;

  return (
    <View style={styles.screen}>
      <PublicHeader title={`${municipality?.name || 'Municipality'} Gallery`} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <Pressable accessibilityRole="link" onPress={() => router.push(`/municipality/${id}`)} style={styles.back}>
            <ArrowLeftIcon size={16} color={t.success[100]} />
            <Text style={styles.backText} numberOfLines={1}>Back to {municipality?.name || 'municipality'}</Text>
          </Pressable>
          <View style={styles.titleRow}>
            <MunicipalitySeal municipality={municipality} size={56} ring={0.8} letterSize={22} />
            <View style={styles.titleText}>
              <View style={styles.tagline}>
                <MapPinIcon size={15} color={t.secondary[50]} />
                <Text style={styles.taglineText}>Community images and stories</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.content}>
          {loading ? (
            <View style={styles.message}><Text style={styles.messageText}>Loading gallery…</Text></View>
          ) : gallery.length === 0 ? (
            <View style={styles.message}>
              <EmptyArt name="gallery" size={104} />
              <Text style={styles.messageText}>No gallery images have been uploaded yet.</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {gallery.map((image, index) => {
                const w = index === 0 ? full : half;
                return (
                  <Image
                    // eslint-disable-next-line react/no-array-index-key
                    key={`${image}-${index}`}
                    source={{ uri: resolveImg(image) }}
                    accessibilityLabel={`${municipality.name} gallery ${index + 1}`}
                    resizeMode="cover"
                    style={[styles.photo, { width: w, height: (w * 3) / 4 }]}
                  />
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  page: { flexGrow: 1, backgroundColor: t.neutral[0] },

  header: { paddingTop: 8, paddingBottom: 20, paddingHorizontal: GUTTER, backgroundColor: t.primary[800] },
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7, minHeight: 44, maxWidth: '100%' },
  backText: { flexShrink: 1, fontSize: 13, lineHeight: 20.8, color: t.success[100], ...font(400) },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  titleText: { flex: 1, minWidth: 0 },
  tagline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  taglineText: { flexShrink: 1, fontSize: 13, lineHeight: 20.8, color: t.secondary[50], ...font(400) },

  content: { padding: GUTTER },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  photo: { borderRadius: 12, backgroundColor: t.secondary[50] },

  message: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: t.neutral[0],
  },
  messageText: { fontSize: 14, lineHeight: 22.4, color: text.muted, textAlign: 'center', ...font(400) },
});
