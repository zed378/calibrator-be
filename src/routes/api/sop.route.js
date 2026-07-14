/**
 * @swagger
 * tags:
 *   name: SOP
 *   description: Document Control and Training System
 */

const express = require("express");
const router = express.Router();
const { auth } = require("../../middlewares/auth.middleware");
const {
  createDocument,
  getDocuments,
  publishDocument,
  acknowledgeTraining,
} = require("../../controllers/sop.controller");

router.use(auth);

// Document Routes
router.post("/", createDocument);
router.get("/", getDocuments);
router.patch("/:id/publish", publishDocument);

// Training Routes
router.post("/:id/acknowledge", acknowledgeTraining);

module.exports = router;
