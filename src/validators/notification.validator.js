const Joi = require("joi");

// ==========================================
// COMMON SCHEMAS
// ==========================================

// ==========================================
// SCHEMA DEFINITIONS
// ==========================================

// Notifications endpoints do not currently require payload validation

// ==========================================
// VALIDATION HELPERS
// ==========================================

exports.validate = (body, schema) => {
  return schema.validate(body, {
    abortEarly: false,
    stripUnknown: true,
  });
};

exports.formatErrors = (details) => {
  return details.map((item) => ({
    field: item.path.join("."),
    message: item.message,
  }));
};
