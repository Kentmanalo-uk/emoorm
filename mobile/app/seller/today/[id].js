import { useLocalSearchParams } from 'expo-router';
import PostForm from '../../../src/components/seller/today/PostForm';

/*
 * /seller/today/<id>: edit one post on Today's menu, on the same page as
 * posting, filled in (the website's /seller/today/:id/edit).
 */
export default function SellerTodayEditScreen() {
  const { id } = useLocalSearchParams();
  return <PostForm key={id} editId={String(id)} />;
}
