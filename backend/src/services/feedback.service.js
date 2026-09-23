const feedbackRepository = require('../repositories/feedback.repository');
const userRepository = require('../repositories/user.repository');
const notificationService = require('./notification.service');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Feedback Service
 *
 * One-way notes about the platform itself, addressed to the super admin.
 * A support case is a conversation someone is waiting on an answer to; this
 * is not, which is why it does not go through the support inbox.
 */

const VALID_CATEGORIES = [
  'USABILITY',
  'PERFORMANCE',
  'BUG',
  'FEATURE_REQUEST',
  'DESIGN',
  'PRAISE',
  'OTHER',
];
const VALID_STATUSES = ['NEW', 'REVIEWED', 'ARCHIVED'];

const MESSAGE_MAX = 4000;
const PAGE_MAX = 200;

/**
 * Leave feedback.
 * @param {Object} actor - The signed-in user (req.user).
 * @param {Object} data - { category, rating?, message, page? }
 */
const submitFeedback = async (actor, data = {}) => {
  const category = data.category || 'OTHER';
  if (!VALID_CATEGORIES.includes(category)) {
    throw new ApiError('Invalid feedback category', 400);
  }

  const message = typeof data.message === 'string' ? data.message.trim() : '';
  if (!message) throw new ApiError('Please tell us what you think', 400);
  if (message.length > MESSAGE_MAX) {
    throw new ApiError(`Feedback cannot be longer than ${MESSAGE_MAX} characters`, 400);
  }

  let rating = null;
  if (data.rating !== undefined && data.rating !== null && data.rating !== '') {
    rating = Number(data.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new ApiError('Rating must be a whole number from 1 to 5', 400);
    }
  }

  // Where they were standing, trimmed to the column width. Purely context for
  // the reader — never trusted for anything.
  const page = typeof data.page === 'string' && data.page.trim()
    ? data.page.trim().slice(0, PAGE_MAX)
    : null;

  // The role and municipality are read from the account, not the request, so
  // the sender cannot label themselves as somebody else.
  const sender = await userRepository.findById(actor.id);

  const feedback = await feedbackRepository.create({
    userId: actor.id,
    role: sender?.role || actor.role || null,
    municipalityId: sender?.municipalityId || null,
    category,
    rating,
    message,
    page,
  });

  // Non-blocking: feedback that was stored must not be lost to a failed notice.
  try {
    await notificationService.notifySuperAdmins({
      type: 'SYSTEM_ANNOUNCEMENT',
      title: 'New feedback received',
      message: message.length > 120 ? `${message.slice(0, 117)}...` : message,
      relatedId: feedback.id,
      target: { kind: 'admin-feedback', id: feedback.id },
    }, { excludeUserId: actor.id });
  } catch (err) {
    console.error('[submitFeedback] notification failed:', err.message);
  }

  return feedback;
};

/** The super admin's list. Municipal admins never reach this. */
const listFeedback = async (options = {}) => {
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(options.pageSize, 10) || 20));

  if (options.status && !VALID_STATUSES.includes(options.status)) {
    throw new ApiError('Invalid feedback status', 400);
  }
  if (options.category && !VALID_CATEGORIES.includes(options.category)) {
    throw new ApiError('Invalid feedback category', 400);
  }

  return feedbackRepository.findAll({
    page,
    pageSize,
    status: options.status || undefined,
    category: options.category || undefined,
    municipalityId: options.municipalityId || undefined,
    role: options.role || undefined,
    search: options.search ? String(options.search).trim().slice(0, 120) : undefined,
  });
};

const getFeedbackById = async (id) => {
  const feedback = await feedbackRepository.findById(id);
  if (!feedback) throw new ApiError('Feedback not found', 404);
  return feedback;
};

const getSummary = async () => feedbackRepository.summarise();

const getNewCount = async () => feedbackRepository.countNew();

/**
 * Triage a piece of feedback. Marking it reviewed records who did it, so the
 * queue is auditable rather than just shrinking.
 */
const updateFeedback = async (id, { status, adminNotes }, actor) => {
  const existing = await feedbackRepository.findById(id);
  if (!existing) throw new ApiError('Feedback not found', 404);

  const data = {};

  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) {
      throw new ApiError('Invalid feedback status', 400);
    }
    data.status = status;
    if (status === 'NEW') {
      // Putting it back in the queue clears the decision that took it out.
      data.reviewedAt = null;
      data.reviewedById = null;
    } else if (existing.status === 'NEW') {
      data.reviewedAt = new Date();
      data.reviewedById = actor?.id || null;
    }
  }

  if (adminNotes !== undefined) {
    const notes = typeof adminNotes === 'string' ? adminNotes.trim() : '';
    data.adminNotes = notes ? notes.slice(0, MESSAGE_MAX) : null;
  }

  if (Object.keys(data).length === 0) {
    throw new ApiError('Nothing to update', 400);
  }

  return feedbackRepository.update(id, data);
};

module.exports = {
  VALID_CATEGORIES,
  VALID_STATUSES,
  submitFeedback,
  listFeedback,
  getFeedbackById,
  getSummary,
  getNewCount,
  updateFeedback,
};
