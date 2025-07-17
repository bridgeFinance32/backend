"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = __importDefault(require("../config/config"));
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = (authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer '))
        ? authHeader.split(' ')[1]
        : null;
    if (!token) {
        res.status(401).json({ message: 'Access token required' });
        return;
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, config_1.default.ACCESS_TOKEN_SECRET);
        req.user = decoded;
        next();
    }
    catch (err) {
        res.status(401).json({ message: 'Invalid or expired access token' });
        console.log(err);
    }
};
exports.authenticate = authenticate;
