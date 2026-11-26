const router = require('express').Router();
const auth = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');
const c = require('../controllers/paymentController');

// Webhook de la pasarela: público, autenticado por firma HMAC (no por JWT)
router.post('/webhook', c.webhook);

router.post('/', auth, authorize('estudiante'), c.create);
router.get('/my', auth, authorize('estudiante'), c.myPayments);
router.post('/:referencia/card', auth, authorize('estudiante'), c.payCard);
router.post('/:referencia/report-qr', auth, authorize('estudiante'), c.reportQr);

// Caja (personal): validar cobros en efectivo / QR
router.get('/', auth, authorize('cocina_central', 'admin'), c.listAll);
router.get('/reference/:referencia', auth, authorize('cocina_central', 'admin'), c.lookup);
router.post('/:id/confirm', auth, authorize('cocina_central', 'admin'), c.confirm);
router.post('/:id/reject', auth, authorize('cocina_central', 'admin'), c.reject);
router.get('/:id', auth, authorize('estudiante', 'cocina_central', 'admin'), c.getOne);

module.exports = router;
