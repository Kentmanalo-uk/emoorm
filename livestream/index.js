/*
 * E-MOORM Live: live selling, run by E-MOORM itself.
 *
 * No video service and no media server. The seller's browser compresses the
 * camera (WebCodecs, on the phone's own video chip) into one-second pieces of
 * fragmented MP4 and uploads them (client/publisher.js); this module keeps
 * the last few pieces in memory and hands them to viewers as they arrive
 * (server/router.js), who play them with Media Source (client/player.js) or,
 * where there is none, as an HLS playlist. Nothing is recorded: when a live
 * ends its video is gone.
 *
 * The backend mounts it (backend/src/app.js):
 *   app.use('/api/live', require('../../livestream')({ express, authenticate, optionalAuth, hooks }));
 * and supplies what it needs from the shop's data (backend/src/services/live.hooks.js).
 * It has no packages of its own.
 */
const createLiveRouter = require('./server/router');

module.exports = createLiveRouter;
module.exports.sessions = require('./server/sessions');
