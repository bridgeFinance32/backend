"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyRefreshToken = exports.signRefreshToken = exports.signAccessToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = __importDefault(require("../config/config"));
const signAccessToken = (userId) => {
    return jsonwebtoken_1.default.sign({ id: userId }, config_1.default.ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
};
exports.signAccessToken = signAccessToken;
const signRefreshToken = (userId) => {
    return jsonwebtoken_1.default.sign({ id: userId }, config_1.default.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
};
exports.signRefreshToken = signRefreshToken;
const verifyRefreshToken = (token) => {
    return jsonwebtoken_1.default.verify(token, config_1.default.REFRESH_TOKEN_SECRET);
};
exports.verifyRefreshToken = verifyRefreshToken;
