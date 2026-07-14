const { error } = require("../utils/response.util");

exports.validate = (schema) => {
  return (req, res, next) => {
    const { error: validationError, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (validationError) {
      const formattedErrors = validationError.details.map((item) => ({
        field: item.path.join("."),
        message: item.message,
      }));

      return error(res, formattedErrors, "Validation Error", 400);
    }

    req.body = value;
    next();
  };
};
