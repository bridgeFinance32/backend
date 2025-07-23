"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = __importDefault(require("../config/config"));
const authenticate = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    // Try getting token from (1) Authorization header, (2) cookies (for iOS compatibility)
    let token = null;
    // 1. Check Authorization header (standard approach)
    const authHeader = req.headers.authorization;
    if (authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }
    // 2. Fallback to checking cookies (iOS Safari sometimes has header issues)
    if (!token && ((_a = req.cookies) === null || _a === void 0 ? void 0 : _a.accessToken)) {
        token = req.cookies.accessToken;
    }
    if (!token) {
        // Add iOS-friendly cache control headers
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.status(401).json({ message: 'Authentication required' });
        return;
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, config_1.default.ACCESS_TOKEN_SECRET); // Type assertion
        // Here's the critical fix - properly assign the user to the request
        req.user = { id: decoded.id }; // Cast to IUser if needed
        // Add security headers for all authenticated requests
        res.setHeader('Cache-Control', 'private, no-cache');
        next();
    }
    catch (err) {
        // Clear cookies if token verification fails
        res.clearCookie('accessToken', {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            domain: '.netlify.app',
            path: '/',
        });
        res.setHeader('Cache-Control', 'no-store');
        res.status(401).json({ message: 'Invalid or expired token' });
    }
});
exports.authenticate = authenticate;
