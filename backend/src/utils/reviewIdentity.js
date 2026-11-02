/**
 * How a review is named when it leaves the server.
 *
 * A reviewer chooses one of three (Review.displayAs): their name, their
 * username, or nobody. The choice is applied HERE rather than in the
 * apps, because a name the client is asked not to draw is still a name
 * anyone can read out of the response — which is not anonymity, it is a
 * blindfold on the honest.
 *
 * ANONYMOUS therefore drops the lot: the name, the username, the photo,
 * and the user's id, since an id is a link to the profile page and to
 * every other review they have written. What is left is a flag the apps
 * use to draw an avatar from the review's own id — so an anonymous
 * review has a stable little picture that cannot be tied back to the
 * person or to their other anonymous reviews.
 *
 * The owner's own copies (My reviews) are already scoped to them, and
 * `keepOwner` leaves those alone so they can still edit what they wrote.
 */

const ANONYMOUS_NAME = 'Anonymous';

/** The reviewer as other shoppers may see them. */
const publicReviewer = (review) => {
  const person = review?.user || review?.buyer || null;
  const how = review?.displayAs || 'NAME';

  if (how === 'ANONYMOUS') {
    // No id: everything else about them hangs off it.
    return { fullName: ANONYMOUS_NAME, anonymous: true };
  }
  if (!person) return null;

  if (how === 'USERNAME') {
    // The handle is public on their profile already; the legal name is not.
    return {
      id: person.id,
      fullName: person.username ? `@${person.username}` : person.fullName,
      username: person.username || null,
      profilePhoto: person.profilePhoto || null,
      avatarKey: person.avatarKey || null,
    };
  }
  return {
    id: person.id,
    fullName: person.fullName,
    username: person.username || null,
    profilePhoto: person.profilePhoto || null,
    avatarKey: person.avatarKey || null,
  };
};

/** One review, named as it should leave. */
const maskReview = (review, { keepOwner = false } = {}) => {
  if (!review || keepOwner) return review;
  const reviewer = publicReviewer(review);
  const out = { ...review, user: reviewer };
  // Some callers read `buyer`; both must say the same thing.
  if ('buyer' in review) out.buyer = reviewer;
  if (review.displayAs === 'ANONYMOUS') delete out.userId;
  return out;
};

/** A page of reviews, or any shape with a `reviews` array. */
const maskReviews = (data, options) => {
  if (!data) return data;
  if (Array.isArray(data)) return data.map((r) => maskReview(r, options));
  if (Array.isArray(data.reviews)) return { ...data, reviews: data.reviews.map((r) => maskReview(r, options)) };
  return data;
};

module.exports = { ANONYMOUS_NAME, publicReviewer, maskReview, maskReviews };
