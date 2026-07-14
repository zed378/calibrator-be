const express = require("express");
const router = express.Router();
const dataRetentionController = require("../../controllers/dataRetention.controller");
const { auth, superAdminOnly } = require("../../middlewares/auth.middleware");

router.use(auth);

router.get("/:tenantId/policy", dataRetentionController.getRetentionPolicy);
router.put("/:tenantId/policy", superAdminOnly, dataRetentionController.setRetentionPolicy);
router.get("/:tenantId/legal-hold", dataRetentionController.isOnLegalHold);
router.post("/:tenantId/legal-hold", superAdminOnly, dataRetentionController.enableLegalHold);
router.delete("/:tenantId/legal-hold", superAdminOnly, dataRetentionController.disableLegalHold);
router.post("/:tenantId/purge", superAdminOnly, dataRetentionController.purgeExpiredRecords);
router.post("/:tenantId/mask-pii", superAdminOnly, dataRetentionController.maskPII);
router.post("/:tenantId/anonymize", superAdminOnly, dataRetentionController.anonymizeDataset);

module.exports = router;
