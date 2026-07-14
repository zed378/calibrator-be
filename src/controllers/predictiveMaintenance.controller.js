const predictiveMaintenanceService = require("../services/predictiveMaintenance.service");
const { success } = require("../utils/response.util");
const { CalibrationDevice } = require("../models");
const { AppError } = require("../utils/appError.util");
const { tenantStorage } = require("../middlewares/tenantContext.middleware");

exports.analyzeDevice = async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const { tenantId } = tenantStorage.getStore();

    const result = await predictiveMaintenanceService.analyzeDevice(tenantId, deviceId);
    return res.status(200).json(success("Analysis complete", result));
  } catch (error) {
    next(error);
  }
};

exports.getRecommendations = async (req, res, next) => {
  try {
    const { tenantId } = tenantStorage.getStore();

    const devices = await CalibrationDevice.findAll({
      where: {
        tenantId,
        recommendedCalibrationInterval: {
          $ne: null
        }
      },
      attributes: ["id", "name", "serialNumber", "calibrationIntervalDays", "recommendedCalibrationInterval", "recommendationReason"]
    });

    return res.status(200).json(success("Recommendations retrieved", devices));
  } catch (error) {
    next(error);
  }
};

exports.approveRecommendation = async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const { tenantId } = tenantStorage.getStore();

    const device = await CalibrationDevice.findOne({
      where: { id: deviceId, tenantId }
    });

    if (!device) {
      throw new AppError(404, "Device not found");
    }

    if (!device.recommendedCalibrationInterval) {
      throw new AppError(400, "Device does not have a pending recommendation");
    }

    await device.update({
      calibrationIntervalDays: device.recommendedCalibrationInterval,
      recommendedCalibrationInterval: null,
      recommendationReason: null
    });

    return res.status(200).json(success("Recommendation applied successfully", device));
  } catch (error) {
    next(error);
  }
};
