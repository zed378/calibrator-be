/**
 * @swagger
 * tags:
 *   name: QMS
 *   description: Quality Management System endpoints (CAPA, Non-Conformance)
 */

const express = require("express");
const router = express.Router();
const { auth } = require("../../middlewares/auth.middleware");
const {
  createNC,
  getNCs,
  updateNC,
  createCapa,
  getCapas,
  updateCapa,
} = require("../../controllers/qms.controller");

router.use(auth);

// Non-Conformance Routes
router.post("/nc", createNC);
router.get("/nc", getNCs);
router.patch("/nc/:id", updateNC);

// CAPA Routes
router.post("/capa", createCapa);
router.get("/capa", getCapas);
router.patch("/capa/:id", updateCapa);

module.exports = router;
