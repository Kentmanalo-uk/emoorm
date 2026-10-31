import { StarIcon as Star } from '../lib/icons';
import { View, StyleSheet } from 'react-native';
import { colors, themed } from '../theme';

export default function StarRating({ rating = 0, size = 14, max = 5 }) {
  const rounded = Math.round(rating);

  return (
    <View style={styles.row}>
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          size={size}
          color={colors.star}
          weight={i < rounded ? 'fill' : 'regular'}
        />
      ))}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  row: { flexDirection: 'row', gap: 2 },
}));
