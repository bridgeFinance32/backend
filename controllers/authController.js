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
const apiTypes_1 = require("../types/apiTypes");
const jwt_1 = require("../Utils/jwt");
const register = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const session = yield mongoose_1.default.startSession();
    session.startTransaction();
    try {
        const { email, username, password } = req.body;
        // Validate input
        if (!email || !username || !password) {
            yield session.abortTransaction();
            res.status(400).json({ message: "Missing required user data" });
            return; // Explicit void return
        }
        // Check for existing user (within transaction)
        const existingUser = yield userModel_1.User.findOne({
            $or: [{ email }, { username }]
        }).session(session);
        if (existingUser) {
            yield session.abortTransaction();
            res.status(409).json({ message: "Email or username already in use" });
            return; // Explicit void return
        }
        // Create user (within transaction)
        const user = new userModel_1.User({ email, username, password });
        yield user.save({ session });
        // Initialize balances (within transaction)
        // Commit transaction
        yield session.commitTransaction();
        // Return response
        const userResponse = {
            email: user.email,
            username: user.username,
            id: user._id
        };
        res.status(201).json({
            message: "User registered successfully",
            data: userResponse
        });
        return; // Explicit void return
    }
    catch (err) {
        // Handle any errors that occur during the transaction
        yield session.abortTransaction();
        console.log(err);
        // Special handling for duplicate key errors
        if (err.code === 11000) {
            res.status(409).json({ message: "Email or username already in use" });
            return; // Explicit void return
        }
        next(err);
        return; // Explicit void return
    }
    finally {
        // Ensure session is always ended
        session.endSession();
    }
});
exports.register = register;
const checkUsernameAvailability = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { username } = req.query;
        // Validate input
        if (!username || typeof username !== 'string') {
            res.status(apiTypes_1.HTTP_STATUS.BAD_REQUEST).json({
                available: false
            });
            return;
        }
        // Case-insensitive search
        const existingUser = yield userModel_1.User.findOne({
            username: { $regex: new RegExp(`^${username}$`, 'i') }
        });
        res.status(apiTypes_1.HTTP_STATUS.SUCCESS).json({
            available: !existingUser
        });
        return;
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
        // Set refresh token in HttpOnly cookie
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: true, // must be true for HTTPS
            sameSite: 'none', // allow cross-site cookie for production
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        res.status(200).json({ accessToken });
    }
    catch (err) {
        next(err);
        return;
    }
});
exports.login = login;
const getUser = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        // 1. Get and validate user ID from JWT
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({
                status: "fail",
                message: "Unauthorized - Missing user credentials"
            });
            return;
        }
        // 2. Fetch user from database
        const user = yield userModel_1.User.findById(userId)
            .select('-password -__v -refreshToken -emailVerificationToken');
        if (!user) {
            res.status(404).json({
                status: "fail",
                message: "User account not found"
            });
            return;
        }
        res.set('Cache-Control', 'private, max-age=60, must-revalidate');
        // 3. Return standardized response
        res.status(200).json({
            status: "success",
            data: {
                id: user._id,
                email: user.email,
                username: user.username,
                role: user.role,
                isVerified: user.isVerified,
                lastLogin: user.lastLogin,
                balance: user.balances
            }
        });
    }
    catch (error) {
        // 4. Special handling for invalid ID format
        if (error instanceof mongoose_1.default.Error.CastError) {
            res.status(400).json({
                status: "fail",
                message: "Invalid user identifier format"
            });
            return;
        }
        // 5. Pass all other errors to central error handler
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
        res.json({ accessToken });
    }
    catch (err) {
        res.status(403).json({ message: 'Invalid or expired refresh token' });
        return;
    }
});
exports.refreshAccessToken = refreshAccessToken;
const logout = (req, res) => {
    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: true,
        sameSite: 'none'
    });
    res.status(200).json({ message: 'Logged out successfully' });
};
exports.logout = logout;
const verify = (req, res) => {
    res.status(200).json({ verified: true });
};
exports.verify = verify;
