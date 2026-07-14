"use strict";

module.exports = {
  up: async ({ context }) => {
    const { sequelize } = context;
    const DataTypes = sequelize.Sequelize.DataTypes;
    
    await context.addColumn("calibration_devices", "uncertainty_budget", {
      type: DataTypes.JSONB,
      allowNull: true,
    });
    
    await context.addColumn("calibration_records", "measurement_uncertainty", {
      type: DataTypes.FLOAT,
      allowNull: true,
    });
  },

  down: async ({ context }) => {
    await context.removeColumn("calibration_records", "measurement_uncertainty");
    await context.removeColumn("calibration_devices", "uncertainty_budget");
  },
};
