import { Text } from 'react-native';
import { font } from '../../theme';
import { priceUnit } from './productKinds';
import { startsFrom } from './kindBuying';

/**
 * A product card's price with what it is for (web/src/components/product/
 * kinds/KindPrice.jsx): "from" before a paluto priced by size, " / head" or
 * " / package" after the amount, smaller (0.78em) and medium, in the price's
 * colour. Render it inside the price's <Text>; `size` is that text's size.
 */
export default function KindPrice({ product, size = 14, children }) {
  const unit = priceUnit(product);
  const small = { fontSize: size * 0.78, ...font(500) };
  return (
    <>
      {startsFrom(product) ? <Text style={small}>from </Text> : null}
      {children}
      {unit ? <Text style={small}>{unit}</Text> : null}
    </>
  );
}
