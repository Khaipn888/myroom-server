// utils/BaseController.js

const ResponseFormatter = require('./ResponseFormatter');

class BaseController {
  static async handle(req, res, controllerFn) {
    try {
      await controllerFn(req, res);
    } catch (error) {
      console.error('Controller Error:', error);
      res.status(500).json(ResponseFormatter.error("Internal server error", error.message));
    }
  }
}

module.exports = BaseController;
