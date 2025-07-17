"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.User = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const userSchema = new mongoose_1.Schema({
    username: {
        type: String,
        required: [true, "Username is required"],
        unique: true,
        trim: true,
        minlength: [3, "Username must be at least 3 characters"],
        maxlength: [30, "Username cannot exceed 30 characters"],
        match: [/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers and underscores"],
    },
    email: {
        type: String,
        required: [true, "Email is required"],
        unique: true,
        lowercase: true,
        trim: true,
        validate: {
            validator: (email) => {
                return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
            },
            message: "Invalid email address",
        },
    },
    password: {
        type: String,
        required: [true, "Password is required"],
        minlength: [8, "Password must be at least 8 characters"],
        select: false,
    },
    role: {
        type: String,
        enum: ["user", "admin", "moderator"],
        default: "user",
    },
    isVerified: {
        type: Boolean,
        default: false,
    },
    isBanned: {
        type: Boolean,
        default: false,
    },
    twoFactorEnabled: {
        type: Boolean,
        default: false,
    },
    lastPasswordChange: {
        type: Date,
        default: Date.now,
    },
    lastLogin: {
        type: Date,
    },
    balances: {
        btc: {
            available: { type: Number, default: 0, min: 0 },
            pending: { type: Number, default: 0, min: 0 }
        },
        eth: {
            available: { type: Number, default: 0, min: 0 },
            pending: { type: Number, default: 0, min: 0 }
        },
        link: {
            available: { type: Number, default: 0, min: 0 },
            pending: { type: Number, default: 0, min: 0 }
        },
        bnb: {
            available: { type: Number, default: 0, min: 0 },
            pending: { type: Number, default: 0, min: 0 }
        },
        usdt: {
            available: { type: Number, default: 0, min: 0 },
            pending: { type: Number, default: 0, min: 0 }
        },
        usdc: {
            available: { type: Number, default: 0, min: 0 },
            pending: { type: Number, default: 0, min: 0 }
        }
    }
}, {
    timestamps: true,
    toJSON: {
        virtuals: true,
        transform: (doc, ret) => {
            delete ret.password;
            delete ret.__v;
            return ret;
        },
    },
    toObject: {
        virtuals: true,
        transform: (doc, ret) => {
            delete ret.password;
            delete ret.__v;
            return ret;
        },
    },
});
// Password hashing middleware
userSchema.pre("save", function (next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!this.isModified("password"))
            return next();
        try {
            const salt = yield bcrypt_1.default.genSalt(12);
            this.password = yield bcrypt_1.default.hash(this.password, salt);
            this.lastPasswordChange = new Date();
            next();
        }
        catch (err) {
            next(err);
        }
    });
});
// Password verification method
userSchema.methods.isValidPassword = function (candidatePassword) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return yield bcrypt_1.default.compare(candidatePassword, this.password);
        }
        catch (err) {
            console.error("Password comparison error:", err);
            return false;
        }
    });
};
// ======================
// OPTIMIZED INDEXES
// ======================
// Basic indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });
// Query optimization indexes
userSchema.index({ role: 1 }); // For role-based queries
userSchema.index({ isVerified: 1 }); // For verification status checks
userSchema.index({ isBanned: 1 }); // For ban status checks
userSchema.index({ lastLogin: -1 }); // For recent activity sorting
// Compound indexes for common query patterns
userSchema.index({
    role: 1,
    isVerified: 1,
    isBanned: 1
}); // For admin dashboard queries
userSchema.index({
    "balances.btc.available": 1
}); // For BTC balance queries
userSchema.index({
    "balances.eth.available": 1
}); // For ETH balance queries
userSchema.index({
    "balances.usdt.available": 1,
    "balances.usdc.available": 1
}); // For stablecoin queries
exports.User = mongoose_1.default.model("User", userSchema);
