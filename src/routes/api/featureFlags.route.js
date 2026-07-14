const express = require("express");
const router = express.Router();
const featureFlagController = require("../../controllers/featureFlag.controller");
const { auth, superAdminOnly } = require("../../middlewares/auth.middleware");

router.use(auth);

router.get("/", featureFlagController.getTenantFlags);
router.get("/definitions", featureFlagController.getAllFlagDefinitions);
router.get("/:tenantId/:flagKey", featureFlagController.isFlagEnabled);
router.post("/:tenantId/:flagKey", superAdminOnly, featureFlagController.setTenantFlag);
router.delete("/:tenantId/:flagKey", superAdminOnly, featureFlagController.resetTenantFlag);
router.post("/:tenantId/initialize", superAdminOnly, featureFlagController.initializeTenantFlags);

module.exports = router;
