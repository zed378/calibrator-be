const express = require("express");
const router = express.Router();
const iotController = require("../../controllers/iot.controller");

// HTTP Ingestion endpoint
// POST /api/v1/iot/ingest
router.post("/ingest", iotController.ingestHttp);

module.exports = router;
