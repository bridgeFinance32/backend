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
exports.verify = exports.logout = exports.refreshAccessToken = exports.getUser = exports.login = exports.checkUsernameAvailability = exports.register = void 0;
const userModel_1 = require("../model/userModel");
const mongoose_1 = __importDefault(require("mongoose"));
const jwt_1 = require("../Utils/jwt");
const register = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const session = yield mongoose_1.default.startSession();
    session.startTransaction();
    try {
        const { email, username, password } = req.body;
        if (!email || !username || !password) {
            yield session.abortTransaction();
            res.status(400).json({ message: "Missing required user data" });
            return;
        }
        const existingUser = yield userModel_1.User.findOne({
            $or: [{ email }, { username }]
        }).session(session);
        if (existingUser) {
            yield session.abortTransaction();
            res.status(409).json({ message: "Email or username already in use" });
            return;
        }
        const user = new userModel_1.User({ email, username, password });
        yield user.save({ session });
        yield session.commitTransaction();
        res.status(201).json({
            message: "User registered successfully",
            data: {
                email: user.email,
                username: user.username,
                id: user._id
            }
        });
    }
    catch (err) {
        yield session.abortTransaction();
        if (err.code === 11000) {
            res.status(409).json({ message: "Email or username already in use" });
            return;
        }
        next(err);
    }
    finally {
        session.endSession();
    }
});
exports.register = register;
const checkUsernameAvailability = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { username } = req.query;
        if (!username || typeof username !== 'string') {
            res.status(400).json({ available: false });
            return;
        }
        const existingUser = yield userModel_1.User.findOne({
            username: { $regex: new RegExp(`^${username}$`, 'i') }
        });
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.status(200).json({ available: !existingUser });
    }
    catch (error) {
        next(error);
    }
});
exports.checkUsernameAvailability = checkUsernameAvailability;
const login = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ message: 'Please provide email and password' });
            return;
        }
        const user = yield userModel_1.User.findOne({ email }).select('+password');
        if (!user || !(yield user.isValidPassword(password))) {
            res.status(401).json({ message: 'Invalid email or password' });
            return;
        }
        const accessToken = (0, jwt_1.signAccessToken)(user._id);
        const refreshToken = (0, jwt_1.signRefreshToken)(user._id);
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            domain: '.netlify.app',
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.status(200).json({ accessToken });
    }
    catch (err) {
        next(err);
    }
});
exports.login = login;
const getUser = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({ message: "Unauthorized - Missing user credentials" });
            return;
        }
        const user = yield userModel_1.User.findById(userId)
            .select('-password -__v -refreshToken -emailVerificationToken');
        if (!user) {
            res.status(404).json({ message: "User account not found" });
            return;
        }
        res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
        res.status(200).json({
            id: user._id,
            email: user.email,
            username: user.username,
            role: user.role,
            isVerified: user.isVerified,
            lastLogin: user.lastLogin,
            balance: user.balances
        });
    }
    catch (error) {
        if (error instanceof mongoose_1.default.Error.CastError) {
            res.status(400).json({ message: "Invalid user identifier format" });
            return;
        }
        next(error);
    }
});
exports.getUser = getUser;
const refreshAccessToken = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const token = req.cookies.refreshToken;
        if (!token) {
            res.status(401).json({ message: 'Refresh token missing' });
            return;
        }
        const decoded = (0, jwt_1.verifyRefreshToken)(token);
        const accessToken = (0, jwt_1.signAccessToken)(decoded.id);
        res.cookie('refreshToken', token, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            //domain: '.netlify.app',
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        res.json({ accessToken });
    }
    catch (err) {
        res.status(403).json({ message: 'Invalid or expired refresh token' });
    }
});
exports.refreshAccessToken = refreshAccessToken;
const logout = (req, res) => {
    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        domain: '.netlify.app',
        path: '/',
    });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ message: 'Logged out successfully' });
};
exports.logout = logout;
const verify = (req, res) => {
    res.status(200).json({ verified: true });
};
exports.verify = verify;
