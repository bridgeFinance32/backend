"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = __importDefault(require("express"));
const authController_1 = require("../controllers/authController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const rateLimiter_1 = require("../middlewares/rateLimiter");
exports.authRouter = express_1.default.Router();
//authRoutes
exports.authRouter.post('/register', rateLimiter_1.authLimiter, authController_1.register);
exports.authRouter.post('/refresh', authController_1.refreshAccessToken);
exports.authRouter.post('/login', rateLimiter_1.authLimiter, authController_1.login);
exports.authRouter.post('/logout', rateLimiter_1.authLimiter, authController_1.logout);
exports.authRouter.get('/check-username', rateLimiter_1.authLimiter, authController_1.checkUsernameAvailability);
exports.authRouter.get('/verify', authMiddleware_1.authenticate, authController_1.verify);
//userDataRoutes
exports.authRouter.get('/user', authMiddleware_1.authenticate, authController_1.getUser);
