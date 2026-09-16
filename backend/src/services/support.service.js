const supportRepository = require('../repositories/support.repository');
const { ApiError } = require('../middleware/errorHandler');

const TICKET_TYPES = new Set(['CUSTOMER_CARE', 'FEEDBACK']);
const CARE_CATEGORIES = new Set(['ORDER', 'PAYMENT', 'DELIVERY', 'RETURN', 'ACCOUNT', 'SELLER', 'OTHER']);
const FEEDBACK_CATEGORIES = new Set(['APP_EXPERIENCE', 'PRODUCTS', 'SELLERS', 'DELIVERY', 'FEATURE_REQUEST', 'OTHER']);

const createTicket = async (userId, payload) => {
  const type = String(payload.type || '').toUpperCase();
  const category = String(payload.category || '').toUpperCase();
  const subject = String(payload.subject || '').trim();
  const message = String(payload.message || '').trim();
  const rating = payload.rating == null || payload.rating === '' ? null : Number(payload.rating);

  if (!TICKET_TYPES.has(type)) throw new ApiError('Invalid support request type', 400);
  const validCategories = type === 'CUSTOMER_CARE' ? CARE_CATEGORIES : FEEDBACK_CATEGORIES;
  if (!validCategories.has(category)) throw new ApiError('Invalid support request category', 400);
  if (subject.length < 3 || subject.length > 120) {
    throw new ApiError('Subject must be between 3 and 120 characters', 400);
  }
  if (message.length < 10 || message.length > 2000) {
    throw new ApiError('Message must be between 10 and 2000 characters', 400);
  }
  if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    throw new ApiError('Rating must be between 1 and 5', 400);
  }

  return supportRepository.create({ userId, type, category, subject, message, rating });
};

const getMyTickets = (userId, options) => supportRepository.findByUser({ userId, ...options });

module.exports = { createTicket, getMyTickets };
