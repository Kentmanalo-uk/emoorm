import { PageLoader } from '../BrandLoader';

/*
 * The shop pages while they load: the building-logo loader (BrandLoader) in
 * the space the page or list will fill. (The names stay from the skeleton
 * shapes these used to draw.)
 */

/** The shop page while it loads. */
export function ShopPageSkeleton({ top = 0 }) {
  return <PageLoader style={{ flex: 1, paddingTop: top }} label="Loading shop" />;
}

/** The shop's product list while it loads. */
export function ShopGridSkeleton() {
  return <PageLoader minHeight={260} label="Loading products" />;
}

/** The stores list while it loads. */
export function StoreCardsSkeleton() {
  return <PageLoader label="Loading shops" />;
}

/** The shop's Home tab while it loads. */
export function ShopHomeSkeleton() {
  return <PageLoader minHeight={260} label="Loading shop" />;
}
