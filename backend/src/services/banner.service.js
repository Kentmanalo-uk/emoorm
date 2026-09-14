const bannerRepository = require('../repositories/banner.repository');
const { ApiError } = require('../middleware/errorHandler');

const sanitize = (input = {}) => {
  const data = {};
  if (input.title !== undefined) {
    const title = String(input.title || '').trim();
    if (!title || title.length > 120) throw new ApiError('Title is required (1-120 characters)', 400);
    data.title = title;
  }
  if (input.subtitle !== undefined) {
    const subtitle = input.subtitle == null ? null : String(input.subtitle).trim();
    if (subtitle && subtitle.length > 400) throw new ApiError('Subtitle must be at most 400 characters', 400);
    data.subtitle = subtitle || null;
  }
  if (input.imageUrl !== undefined) {
    const imageUrl = String(input.imageUrl || '').trim();
    if (!imageUrl) throw new ApiError('Image is required', 400);
    data.imageUrl = imageUrl;
  }
  if (input.linkUrl !== undefined) {
    const linkUrl = input.linkUrl == null ? null : String(input.linkUrl).trim();
    if (linkUrl && linkUrl.length > 500) throw new ApiError('Link URL must be at most 500 characters', 400);
    data.linkUrl = linkUrl || null;
  }
  if (input.sortOrder !== undefined) {
    const n = Number(input.sortOrder);
    if (!Number.isFinite(n)) throw new ApiError('Sort order must be a number', 400);
    data.sortOrder = Math.trunc(n);
  }
  if (input.isActive !== undefined) {
    data.isActive = Boolean(input.isActive);
  }
  return data;
};

const listActive = () => bannerRepository.findActive();
const listAll = () => bannerRepository.findAll();

const create = async (userId, input) => {
  const data = sanitize(input);
  if (!data.title || !data.imageUrl) throw new ApiError('Title and image are required', 400);
  data.createdById = userId || null;
  return bannerRepository.create(data);
};

const update = async (id, input) => {
  const existing = await bannerRepository.findById(id);
  if (!existing) throw new ApiError('Banner not found', 404);
  const data = sanitize(input);
  return bannerRepository.update(id, data);
};

const remove = async (id) => {
  const existing = await bannerRepository.findById(id);
  if (!existing) throw new ApiError('Banner not found', 404);
  return bannerRepository.remove(id);
};

module.exports = { listActive, listAll, create, update, remove };
