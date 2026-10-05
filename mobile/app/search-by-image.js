import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraIcon, CircleNotchIcon, UploadSimpleIcon } from 'phosphor-react-native';
import ScreenHeader from '../src/components/ScreenHeader';
import EmptyArt from '../src/components/EmptyArt';
import { pickSearchImage } from '../src/components/search/ImageSearchSheet';
import { saveImageSearch, takePendingImage } from '../src/components/search/imageSearchStore';
import { STORAGE_KEYS } from '../src/api/client';
import { API_BASE_URL } from '../src/lib/config';
import { toast } from '../src/lib/toast';
import { font, t } from '../src/theme';

/**
 * Search by image (web/src/pages/SearchByImage.jsx, as it shows on phones):
 * the photo picked on the search page (or with "Upload another image") is
 * sent to POST /products/search-by-image; the matches open on the results
 * page (/products?imageSearch=1). The page shows the photo and what is
 * happening: "Analyzing image…", the error, or that nothing was found.
 */
export default function SearchByImage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // The photo handed over by the search page's image sheet (router state on the website).
  const [file, setFile] = useState(() => takePendingImage());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const runSearch = useCallback(async (imageFile) => {
    if (!imageFile) return;
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('image', imageFile.file || {
        uri: imageFile.uri,
        name: imageFile.fileName || `image-search-${Date.now()}.jpg`,
        type: imageFile.mimeType || 'image/jpeg',
      });
      // fetch, not axios: React Native sends a FormData body reliably this way.
      const token = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN).catch(() => null);
      const res = await fetch(`${API_BASE_URL}/products/search-by-image`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) throw new Error(json.message || 'Image search failed');
      saveImageSearch({ results: json.data?.results || [], previewUrl: imageFile.uri });
      router.push({ pathname: '/products', params: { imageSearch: '1' } });
    } catch {
      // The website shows this one message whatever went wrong (its axios
      // errors carry no .response for the page to read).
      const msg = 'Image search failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (file) runSearch(file);
  }, [file, runSearch]);

  const chooseAnother = async () => {
    const asset = await pickSearchImage();
    if (asset) setFile(asset);
  };

  let status;
  if (loading) {
    status = (
      <View style={styles.status}>
        <Spinner />
        <Text style={styles.statusText}>Analyzing image…</Text>
      </View>
    );
  } else if (error) {
    status = (
      <View style={styles.status} accessibilityRole="alert">
        <Text style={[styles.statusText, styles.statusError]}>{error}</Text>
      </View>
    );
  } else {
    status = (
      <View style={styles.status}>
        <EmptyArt name="search" size={96} />
        <Text style={styles.statusText}>No similar products found. Try a clearer photo of a single product.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Search by image" />
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.page, { paddingBottom: 16 + insets.bottom }]}>
        <View style={styles.header}>
          <Text style={styles.sub}>We find visually similar products from local sellers.</Text>
          <Pressable
            style={({ pressed }) => [styles.upload, pressed && styles.uploadPressed]}
            onPress={chooseAnother}
            accessibilityRole="button"
          >
            <UploadSimpleIcon size={16} color={t.primary[700]} />
            <Text style={styles.uploadText}>Upload another image</Text>
          </Pressable>
        </View>

        <View style={styles.body}>
          <View style={styles.preview}>
            {file?.uri ? (
              <Image source={{ uri: file.uri }} style={styles.previewImg} resizeMode="contain" accessibilityLabel="Query" />
            ) : (
              <View style={styles.previewEmpty}>
                {/* The icon sits in a 47px line box (inline svg in 24px text). */}
                <View style={styles.previewIcon}><CameraIcon size={40} color={t.neutral[500]} /></View>
                <Text style={styles.previewText}>No image selected</Text>
              </View>
            )}
          </View>

          <View style={styles.results}>{status}</View>
        </View>
      </ScrollView>
    </View>
  );
}

/** The turning ring while the photo is searched (.sbi-spin). */
function Spinner() {
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(turn, {
      toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web',
    }));
    loop.start();
    return () => loop.stop();
  }, [turn]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <CircleNotchIcon size={28} color={t.neutral[500]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[100] },
  scroll: { flex: 1 },
  // .sbi-page 4px 0 16px; .container 0 12px.
  page: { paddingTop: 4, paddingHorizontal: 12 },

  header: { gap: 12, marginBottom: 12 },
  sub: { fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[500] },
  upload: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 44, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, backgroundColor: t.neutral[0],
  },
  uploadPressed: { backgroundColor: t.neutral[50] },
  uploadText: { fontSize: 14, lineHeight: 22.4, ...font(500), color: t.primary[700] },

  body: { gap: 12 },
  preview: {
    height: 180, overflow: 'hidden', borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[0],
  },
  previewImg: { width: '100%', height: '100%' },
  previewEmpty: { alignItems: 'center', padding: 16 },
  previewIcon: { height: 47 },
  previewText: { marginTop: 8, fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[500], textAlign: 'center' },

  // .sbi-body aligns its items to the start: the card is as wide as what it holds.
  results: { alignSelf: 'flex-start', maxWidth: '100%', padding: 14, borderRadius: 12, backgroundColor: t.neutral[0] },
  status: { alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 140 },
  statusText: { marginBottom: 14, fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[500], textAlign: 'center' },
  statusError: { color: t.danger[600] },
});
