import { useLocalSearchParams } from 'expo-router';
import PostForm from '../../../src/components/seller/today/PostForm';

/*
 * /seller/today/post: post an item to Today's menu on one page (the
 * website's /seller/today/new). ?again=<id> fills it in from an ended post
 * ("Post again"), with no days picked yet; ?product=<id> picks a menu item
 * (Post on the Menu tab).
 */
export default function SellerTodayPostScreen() {
  const { again, product } = useLocalSearchParams();
  return (
    <PostForm
      again={typeof again === 'string' && again ? again : null}
      product={typeof product === 'string' && product ? product : null}
    />
  );
}
