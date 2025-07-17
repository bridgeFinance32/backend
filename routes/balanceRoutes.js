"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.balanceRouter = void 0;
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middlewares/authMiddleware");
const balanceControllers_1 = require("../controllers/balanceControllers");
exports.balanceRouter = express_1.default.Router();
exports.balanceRouter.get("/account/:id", authMiddleware_1.authenticate, balanceControllers_1.accountController);
