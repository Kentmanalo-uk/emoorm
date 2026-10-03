const peso = (n) => `₱${Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

/** "₱20 off orders of ₱300" / "10% off, up to ₱50". */
export const voucherSummary = (v) => {
  const off = v.discountType === 'PERCENT' ? `${Number(v.discountValue)}% off` : `${peso(v.discountValue)} off`;
  const cap = v.discountType === 'PERCENT' && v.maxDiscount ? `, up to ${peso(v.maxDiscount)}` : '';
  const min = v.minOrderAmount ? ` orders of ${peso(v.minOrderAmount)}` : '';
  return `${off}${min}${cap}`;
};
