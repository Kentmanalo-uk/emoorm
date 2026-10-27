import { describe, expect, test } from 'vitest';
import { BACKEND_URL, resolveImg, srcSetFor, parseImages, firstImage } from '../media';

describe('photos', () => {
  test('an uploaded photo lists its smaller copies and itself', () => {
    const set = srcSetFor('/uploads/abc.webp');
    expect(set).toBe([
      `${BACKEND_URL}/uploads/abc-w320.webp 320w`,
      `${BACKEND_URL}/uploads/abc-w640.webp 640w`,
      `${BACKEND_URL}/uploads/abc-w960.webp 960w`,
      `${BACKEND_URL}/uploads/abc.webp 1600w`,
    ].join(', '));
    expect(srcSetFor('/uploads/old-photo.JPG')).toContain('/uploads/old-photo-w320.webp 320w');
  });

  test('nothing else gets a srcset: other sites, private photos, copies, placeholders', () => {
    expect(srcSetFor('https://example.com/uploads/abc.webp')).toBeUndefined();
    expect(srcSetFor('/private-media/abc.webp?e=1&s=x')).toBeUndefined();
    expect(srcSetFor('/uploads/abc-w320.webp')).toBeUndefined();
    expect(srcSetFor('/placeholder-product.png')).toBeUndefined();
    expect(srcSetFor(null)).toBeUndefined();
  });

  test('image paths resolve against the API, and image lists in any shape', () => {
    expect(resolveImg('/uploads/a.webp')).toBe(`${BACKEND_URL}/uploads/a.webp`);
    expect(resolveImg('https://x.test/a.png')).toBe('https://x.test/a.png');
    expect(parseImages('["/a.webp","/b.webp"]')).toEqual(['/a.webp', '/b.webp']);
    expect(parseImages('/a.webp')).toEqual(['/a.webp']);
    expect(firstImage(['/a.webp', '/b.webp'])).toBe('/a.webp');
    expect(firstImage(undefined)).toBeNull();
  });
});
