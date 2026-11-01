const express = require('express');

const router = express.Router();
const blockController = require('../controllers/userBlock.controller');
const { authenticate } = require('../middleware/auth');

/**
 * User Block Routes
 *
 * All of it is about the person asking, so all of it needs a session --
 * unlike follows, where a signed-out visitor may still ask whether a shop
 * is followed. Nobody can ask about somebody else's blocks.
 *
 * The /store/ forms exist because the clients usually hold a shop, not the
 * person behind it; the service turns one into the other.
 */
router.use(authenticate);

// Who I have blocked.
router.get('/me', blockController.listMine);

// Where I stand with one person, or with whoever owns one shop. The store
// routes are declared first so "store" is never read as a user id.
router.get('/status/store/:storeId', blockController.getStoreStatus);
router.get('/status/:userId', blockController.getStatus);

router.post('/store/:storeId', blockController.blockStore);
router.delete('/store/:storeId', blockController.unblockStore);

router.post('/:userId', blockController.block);
router.delete('/:userId', blockController.unblock);

module.exports = router;
