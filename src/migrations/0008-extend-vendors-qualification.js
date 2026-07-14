"use strict";

module.exports = {
  up: async ({ context }) => {
    const { sequelize } = context;
    const DataTypes = sequelize.Sequelize.DataTypes;
    
    await context.addColumn("vendors", "approval_status", {
      type: DataTypes.ENUM("APPROVED", "PENDING", "REJECTED", "CONDITIONAL"),
      defaultValue: "PENDING",
      allowNull: false,
    });
    
    await context.addColumn("vendors", "scorecard", {
      type: DataTypes.INTEGER,
      allowNull: true,
    });

    await context.addColumn("vendors", "last_audit_date", {
      type: DataTypes.DATE,
      allowNull: true,
    });

    await context.addColumn("vendors", "next_audit_date", {
      type: DataTypes.DATE,
      allowNull: true,
    });
  },

  down: async ({ context }) => {
    await context.removeColumn("vendors", "next_audit_date");
    await context.removeColumn("vendors", "last_audit_date");
    await context.removeColumn("vendors", "scorecard");
    await context.removeColumn("vendors", "approval_status");
  },
};
