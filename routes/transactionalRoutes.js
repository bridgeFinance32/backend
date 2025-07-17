"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transactionRouter = void 0;
const express_1 = __importDefault(require("express"));
const transactionControllers_1 = require("../controllers/transactionControllers");
const authMiddleware_1 = require("../middlewares/authMiddleware");
exports.transactionRouter = express_1.default.Router();
exports.transactionRouter.post("/send", authMiddleware_1.authenticate, transactionControllers_1.createTransaction);
exports.transactionRouter.post("/:txId/reverse", authMiddleware_1.authenticate, transactionControllers_1.reverseTransaction);
exports.transactionRouter.post("/:txId/cancel", transactionControllers_1.cancelTransaction);
exports.transactionRouter.get("/user/:userId", authMiddleware_1.authenticate, transactionControllers_1.getTransactionsByUser);
exports.default = exports.transactionRouter;
