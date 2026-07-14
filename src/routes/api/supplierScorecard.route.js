const express = require("express");
const router = express.Router();
const scorecardController = require("../../controllers/supplierScorecard.controller");
const { auth } = require("../../middlewares/auth.middleware");

router.use(auth);

router.post("/", scorecardController.createScorecard);
router.get("/", scorecardController.getScorecards);
router.get("/:id", scorecardController.getScorecardById);
router.put("/:id", scorecardController.updateScorecard);
router.delete("/:id", scorecardController.deleteScorecard);

module.exports = router;
