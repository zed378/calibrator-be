const express = require("express");
const router = express.Router();
const aiController = require("../../controllers/ai.controller");
const { auth } = require("../../middlewares/auth.middleware");
const multer = require("multer");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

router.use(auth);

router.post("/ocr", upload.single("file"), aiController.processOcr);
router.post("/query", aiController.queryRAG);

module.exports = router;
