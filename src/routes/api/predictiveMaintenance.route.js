const express = require("express");
const router = express.Router();
const predictiveMaintenanceController = require("../../controllers/predictiveMaintenance.controller");
const { auth } = require("../../middlewares/auth.middleware");
const { dynamicAccess } = require("../../middlewares/dynamicAccess.middleware");
const { validateUuid } = require("../../middlewares/validateUuid.middleware");

// All endpoints require authentication and "predictiveMaintenance" menu permissions
router.use(auth);

router.post(
  "/analyze/:deviceId",
  validateUuid("deviceId"),
  dynamicAccess("calibration", "write", { checkTenant: true }),
  predictiveMaintenanceController.analyzeDevice
);

router.get(
  "/recommendations",
  dynamicAccess("calibration", "read", { checkTenant: true }),
  predictiveMaintenanceController.getRecommendations
);

router.post(
  "/recommendations/:deviceId/approve",
  validateUuid("deviceId"),
  dynamicAccess("calibration", "write", { checkTenant: true }),
  predictiveMaintenanceController.approveRecommendation
);

module.exports = router;
