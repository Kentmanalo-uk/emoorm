import { Star } from 'lucide-react-native';
import { View, StyleSheet } from 'react-native';
import { colors } from '../theme';

export default function StarRating({ rating = 0, size = 14, max = 5 }) {
  const rounded = Math.round(rating);

  return (
    <View style={styles.row}>
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          size={size}
          color={colors.star}
          fill={i < rounded ? colors.star : 'transparent'}
          strokeWidth={1.5}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 2 },
});
