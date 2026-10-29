const bannerRepository = require('../repositories/banner.repository');
const { cleanText, cleanUrl } = require('../utils/sanitize');
const { cached, invalidate, TAGS } = require('../lib/cachePolicy');
const { ApiError } = require('../middleware/errorHandler');

const PLACEMENTS = ['HOME_CAROUSEL', 'HOME_SIDEBAR_TOP', 'HOME_SIDEBAR_BOTTOM', 'HOME_POPUP'];

const sanitize = (input = {}) => {
  const data = {};
  if (input.title !== undefined) {
    const title = String(input.title || '').trim();
    if (!title || title.length > 120) throw new ApiError('Title is required (1-120 characters)', 400);
    data.title = cleanText(title, { maxLength: 120 });
  }
  if (input.subtitle !== undefined) {
    const subtitle = input.subtitle == null ? null : String(input.subtitle).trim();
    if (subtitle && subtitle.length > 400) throw new ApiError('Subtitle must be at most 400 characters', 400);
    data.subtitle = subtitle ? cleanText(subtitle, { maxLength: 400 }) : null;
  }
  if (input.imageUrl !== undefined) {
    const imageUrl = String(input.imageUrl || '').trim();
    if (!imageUrl) throw new ApiError('Image is required', 400);
    data.imageUrl = imageUrl;
  }
  if (input.linkUrl !== undefined) {
    const linkUrl = input.linkUrl == null ? null : String(input.linkUrl).trim();
    if (linkUrl && linkUrl.length > 500) throw new ApiError('Link URL must be at most 500 characters', 400);
    // This value becomes an href on the homepage. Anything but http(s) or a
    // same-site path — javascript:, data:, vbscript: — is script execution.
    if (linkUrl) {
      const safe = cleanUrl(linkUrl);
      if (!safe) throw new ApiError('Link must be an http(s) address or a site path', 400);
      data.linkUrl = safe;
    } else {
      data.linkUrl = null;
    }
  }
  if (input.placement !== undefined) {
    if (!PLACEMENTS.includes(input.placement)) {
      throw new ApiError('Invalid banner placement', 400);
    }
    data.placement = input.placement;
  }
  if (input.sortOrder !== undefined) {
    const n = Number(input.sortOrder);
    if (!Number.isFinite(n)) throw new ApiError('Sort order must be a number', 400);
    data.sortOrder = Math.trunc(n);
  }
  if (input.isActive !== undefined) {
    data.isActive = Boolean(input.isActive);
  }
  // A schedule: shown from / until these times (empty: no limit that side).
  for (const key of ['startsAt', 'endsAt']) {
    if (input[key] === undefined) continue;
    if (input[key] === null || input[key] === '') {
      data[key] = null;
      continue;
    }
    const at = new Date(input[key]);
    if (Number.isNaN(at.getTime())) throw new ApiError(`${key === 'startsAt' ? 'Start' : 'End'} must be a date and time`, 400);
    data[key] = at;
  }
  return data;
};

/** The schedule as it will be saved: the end must come after the start. */
const checkWindow = (data, existing = {}) => {
  const startsAt = data.startsAt !== undefined ? data.startsAt : existing.startsAt;
  const endsAt = data.endsAt !== undefined ? data.endsAt : existing.endsAt;
  if (startsAt && endsAt && endsAt <= startsAt) throw new ApiError('The end must come after the start', 400);
  // A new end already in the past would only ever hide the banner (an ended
  // banner saved again with its old end is fine).
  const sameEnd = existing.endsAt && data.endsAt && new Date(existing.endsAt).getTime() === data.endsAt.getTime();
  if (data.endsAt && !sameEnd && data.endsAt <= new Date()) throw new ApiError('The end must be in the future', 400);
};

/** Shown now: no start or a start that has come, no end or one still ahead. */
const inWindow = (banner, now = new Date()) => (!banner.startsAt || new Date(banner.startsAt) <= now)
  && (!banner.endsAt || new Date(banner.endsAt) > now);

// The list is cached as a whole; the schedule is applied on every read, so a
// banner starts and ends on time without waiting for the cache.
const listActive = async () => (await cached.bannerList({}, () => bannerRepository.findActive()))
  .filter((banner) => inWindow(banner));
const listAll = () => bannerRepository.findAll();

const create = async (userId, input) => {
  const data = sanitize(input);
  if (!data.title || !data.imageUrl) throw new ApiError('Title and image are required', 400);
  checkWindow(data);
  data.placement = data.placement || 'HOME_CAROUSEL';
  if (data.placement !== 'HOME_CAROUSEL') {
    const occupied = await bannerRepository.findFirstByPlacement(data.placement);
    if (occupied) throw new ApiError('This right-side banner position is already in use', 409);
  }
  data.createdById = userId || null;
  const banner = await bannerRepository.create(data);
  await invalidate(TAGS.banners);
  return banner;
};

const update = async (id, input) => {
  const existing = await bannerRepository.findById(id);
  if (!existing) throw new ApiError('Banner not found', 404);
  const data = sanitize(input);
  checkWindow(data, existing);
  if (data.placement && data.placement !== 'HOME_CAROUSEL' && data.placement !== existing.placement) {
    const occupied = await bannerRepository.findFirstByPlacement(data.placement);
    if (occupied && occupied.id !== id) {
      throw new ApiError('This right-side banner position is already in use', 409);
    }
  }
  const banner = await bannerRepository.update(id, data);
  await invalidate(TAGS.banners);
  return banner;
};

const remove = async (id) => {
  const existing = await bannerRepository.findById(id);
  if (!existing) throw new ApiError('Banner not found', 404);
  const removed = await bannerRepository.remove(id);
  await invalidate(TAGS.banners);
  return removed;
};

module.exports = { listActive, listAll, create, update, remove, inWindow };
