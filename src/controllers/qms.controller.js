const qmsService = require("../services/qms.service");
const { asyncHandlerWithMapping } = require("../utils/controllerWrapper.util");

exports.createNC = asyncHandlerWithMapping(async (req, res) => {
  const result = await qmsService.createNC(req.user.tenantId, req.user.id, req.body);
  return {
    success: true,
    status: 201,
    message: "Non-Conformance created successfully",
    data: result,
  };
}, {});

exports.getNCs = asyncHandlerWithMapping(async (req, res) => {
  const { page, limit, status } = req.query;
  const result = await qmsService.getNCs(req.user.tenantId, page, limit, status);
  return {
    success: true,
    status: 200,
    message: "Non-Conformances retrieved successfully",
    data: result,
  };
}, {});

exports.updateNC = asyncHandlerWithMapping(async (req, res) => {
  const result = await qmsService.updateNC(req.user.tenantId, req.params.id, req.body);
  return {
    success: true,
    status: 200,
    message: "Non-Conformance updated successfully",
    data: result,
  };
}, {
  "Non-Conformance not found": 404,
});

exports.createCapa = asyncHandlerWithMapping(async (req, res) => {
  const result = await qmsService.createCapa(req.user.tenantId, req.body);
  return {
    success: true,
    status: 201,
    message: "CAPA created successfully",
    data: result,
  };
}, {
  "Non-Conformance not found": 404,
});

exports.getCapas = asyncHandlerWithMapping(async (req, res) => {
  const { page, limit, status } = req.query;
  const result = await qmsService.getCapas(req.user.tenantId, page, limit, status);
  return {
    success: true,
    status: 200,
    message: "CAPAs retrieved successfully",
    data: result,
  };
}, {});

exports.updateCapa = asyncHandlerWithMapping(async (req, res) => {
  const result = await qmsService.updateCapa(req.user.tenantId, req.params.id, req.body);
  return {
    success: true,
    status: 200,
    message: "CAPA updated successfully",
    data: result,
  };
}, {
  "CAPA not found": 404,
});
