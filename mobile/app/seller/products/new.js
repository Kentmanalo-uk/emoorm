import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { t, themed } from '../../../src/theme';
import apiClient from '../../../src/api/client';
import { toast } from '../../../src/lib/toast';
import { fetchCategories } from '../../../src/lib/referenceData';
import { isTodayProduct } from '../../../src/lib/availability';
import SellerPage from '../../../src/components/seller/SellerPage';
import { useSellerShell } from '../../../src/components/seller/SellerShell';
import { sellBlockers } from '../../../src/components/seller/sellerSetup';
import { productKind } from '../../../src/components/seller/productKinds';
import ProductForm from '../../../src/components/seller/product-form/ProductForm';
import PackageForm from '../../../src/components/seller/PackageForm';

/*
 * /seller/products/new: the product form as a page of its own (the form
 * part of web/src/pages/SellerProducts.jsx). Params:
 *   edit=<id>       edits that product (the website's /seller/products?edit=<id>)
 *   type=package    creates a package (its own form)
 *   type=today      creates Local Delicacies' Cooked food, a menu item (Create a new menu item)
 *   fromList=1      opened from My products
 * A package (new, or one being edited) gets the package form. The top bar
 * reads "Add product" / "Edit product" as the website's phone bar does (its
 * page heading, "Create a package", is hidden on phones).
 */
export default function SellerProductFormScreen() {
  const router = useRouter();
  const { edit, type } = useLocalSearchParams();
  const editId = typeof edit === 'string' && edit ? edit : null;
  const { store, setup } = useSellerShell();
  // Until the shop is ready to sell, buyers can see its products but cannot order them.
  const blockers = sellBlockers(setup);
  const notReady = blockers.length > 0;

  const [categories, setCategories] = useState([]);
  useEffect(() => {
    let live = true;
    fetchCategories().then((list) => { if (live) setCategories(Array.isArray(list) ? list : []); }).catch(() => {});
    return () => { live = false; };
  }, []);

  // Editing starts from the fresh product, never a saved copy.
  const [editingProduct, setEditingProduct] = useState(null);
  useEffect(() => {
    if (!editId) {
      setEditingProduct(null);
      return undefined;
    }
    let live = true;
    setEditingProduct(null);
    apiClient.get(`/products/${editId}`)
      .then((res) => { if (live) setEditingProduct(res.data || null); })
      .catch((err) => {
        if (!live) return;
        toast.error(err.message || 'Failed to load products');
        router.replace('/seller/products');
      });
    return () => { live = false; };
  }, [editId, router]);

  const closeForm = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/seller/products');
  };

  // My products reloads as it comes back into view. next: Local Delicacies'
  // new Cooked food, after "Saved to your menu": 'post' (Post it now) or 'done'.
  const handleSaved = (saved, { created, next = null }) => {
    if (created && isTodayProduct(saved) && next) {
      router.replace(next === 'post' ? `/seller/today/post?product=${saved.id}` : '/seller/today');
      return;
    }
    if (created && isTodayProduct(saved)) {
      toast.success("Product added. Post it in Today's menu when you have it.");
      router.replace('/seller/today');
      return;
    }
    const what = productKind(saved) === 'PACKAGE' ? 'Package' : 'Product';
    if (created) {
      toast.success(notReady && saved?.status === 'APPROVED'
        ? `${what} added. Buyers can see it, and can order once your shop is ready to sell.`
        : saved?.status === 'APPROVED'
          ? `${what} added. It is now live.`
          : `${what} added. It will go live once approved.`);
    } else {
      toast.success('Changes saved');
    }
    closeForm();
  };

  // "Create a package" from the product form: the same page, as a package.
  const toPackage = () => router.setParams({ type: 'package' });

  if (editId && !editingProduct) {
    return (
      <SellerPage scroll={false}>
        <View style={styles.loading}>
          <ActivityIndicator color={t.primary[600]} />
        </View>
      </SellerPage>
    );
  }

  const packageForm = editId ? productKind(editingProduct) === 'PACKAGE' : type === 'package';

  if (packageForm) {
    return (
      <SellerPage scroll={false}>
        <PackageForm
          key={editId ? editingProduct.id : 'new-package'}
          product={editId ? editingProduct : null}
          store={store}
          onCancel={closeForm}
          onSaved={handleSaved}
          sellBlockers={blockers}
        />
      </SellerPage>
    );
  }

  return (
    <ProductForm
      key={editId ? editingProduct.id : 'new'}
      product={editId ? editingProduct : null}
      categories={categories}
      onCancel={closeForm}
      onSaved={handleSaved}
      onPackage={toPackage}
      sellBlockers={blockers}
      preset={!editId && type === 'today' ? 'today' : null}
    />
  );
}

const styles = themed(() => StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
}));
