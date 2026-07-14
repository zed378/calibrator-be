const express = require("express");
const router = express.Router();
const tenantLifecycleController = require("../../controllers/tenantLifecycle.controller");
const { auth, superAdminOnly } = require("../../middlewares/auth.middleware");

router.use(auth);

router.get("/:tenantId/status", tenantLifecycleController.getTenantLifecycleStatus);
router.post("/:tenantId/suspend", superAdminOnly, tenantLifecycleController.suspendTenant);
router.post("/:tenantId/resume", superAdminOnly, tenantLifecycleController.resumeTenant);
router.post("/:tenantId/grace-period", superAdminOnly, tenantLifecycleController.enterGracePeriod);
router.post("/:tenantId/offboard", superAdminOnly, tenantLifecycleController.offboardTenant);
router.post("/:tenantId/offboard/cancel", superAdminOnly, tenantLifecycleController.cancelOffboarding);
router.get("/:tenantId/export", superAdminOnly, tenantLifecycleController.exportTenantData);

module.exports = router;
