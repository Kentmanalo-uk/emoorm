import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PageLoader } from '../../src/components/BrandLoader';
import { fetchCategories } from '../../src/lib/referenceData';
import { t, themed } from '../../src/theme';

/*
 * A category page, the website's /category/:categorySlug (Home's Seafood and
 * Livestock shortcuts, and the address search engines list). The website
 * renders its Products page for that category; here it hands over to the
 * product results (app/products.js) with the category picked, as
 * /products?category=<id> does, in place of this screen (Back skips it).
 * A slug no category has: all products.
 */
export default function CategoryBySlug() {
  const router = useRouter();
  const { slug } = useLocalSearchParams();
  const wanted = String(Array.isArray(slug) ? slug[0] : slug || '').toLowerCase();

  useEffect(() => {
    let alive = true;
    fetchCategories()
      .catch(() => [])
      .then((list) => {
        if (!alive) return;
        const match = (list || []).find((c) => String(c.slug || '').toLowerCase() === wanted);
        router.replace(match ? { pathname: '/products', params: { category: match.id } } : '/products');
      });
    return () => { alive = false; };
  }, [router, wanted]);

  return (
    <View style={styles.screen}>
      <PageLoader minHeight={320} />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', backgroundColor: t.neutral[100] },
}));
