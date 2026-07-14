const express = require("express");
const router = express.Router();
const riskController = require("../../controllers/risk.controller");
const { auth } = require("../../middlewares/auth.middleware");

router.use(auth);

router.post("/", riskController.createRisk);
router.get("/", riskController.getRisks);
router.get("/:id", riskController.getRiskById);
router.put("/:id", riskController.updateRisk);
router.delete("/:id", riskController.deleteRisk);

module.exports = router;
