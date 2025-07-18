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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Transaction = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const uuid_1 = require("uuid");
const userModel_1 = require("./userModel");
const transactionSchema = new mongoose_1.Schema({
    txId: {
        type: String,
        required: true,
        unique: true,
        default: () => `tx_${(0, uuid_1.v4)().replace(/-/g, '')}`
    },
    sender: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        validate: {
            validator: function (v) {
                return __awaiter(this, void 0, void 0, function* () {
                    const user = yield userModel_1.User.findById(v);
                    return !!user && !user.isBanned;
                });
            },
            message: "Sender must be an active user"
        }
    },
    receiver: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        validate: {
            validator: function (v) {
                return __awaiter(this, void 0, void 0, function* () {
                    const user = yield userModel_1.User.findById(v);
                    return !!user && !user.isBanned;
                });
            },
            message: "Receiver must be an active user"
        }
    },
    amount: {
        type: Number,
        required: true,
        min: [0.00000001, "Amount must be at least 0.00000001"],
        validate: {
            validator: (v) => {
                const str = v.toString();
                const decimalPart = str.split('.')[1] || '';
                return decimalPart.length <= 8 && !isNaN(v);
            },
            message: "Maximum 8 decimal places allowed and must be a valid number"
        }
    },
    fee: {
        type: Number,
        required: true,
        default: 0,
        min: [0, "Fee cannot be negative"],
        validate: {
            validator: Number.isFinite,
            message: "Fee must be a valid number"
        }
    },
    currency: {
        type: String,
        required: true,
        enum: ["BTC", "ETH", "LINK", "BNB", "USDT", "USDC"],
        uppercase: true
    },
    status: {
        type: String,
        enum: ["pending", "completed", "failed", "reversed", "finalized", "cancelled"],
        default: "pending"
    },
    type: {
        type: String,
        enum: ["transfer", "deposit", "withdrawal", "fee", "reversal"],
        required: true
    },
    reversalOf: { type: mongoose_1.Schema.Types.ObjectId, ref: "Transaction" },
    blockchainTxHash: {
        type: String,
        validate: {
            validator: function (v) {
                if (this.status === "completed" && this.type === "transfer") {
                    return !!v && /^0x[a-fA-F0-9]{64}$/.test(v);
                }
                return true;
            },
            message: "Blockchain hash must be 64 hex characters when transaction is completed"
        }
    },
    failureReason: { type: String },
    reversalDeadline: { type: Date },
    completedAt: { type: Date },
    reversedAt: { type: Date },
    cancelledAt: { type: Date },
    finalizedAt: { type: Date }
}, {
    timestamps: true,
    toJSON: {
        virtuals: true,
        transform: (doc, ret) => {
            delete ret.__v;
            // You can add other fields to remove here
            // delete ret._id; 
            return ret;
        }
    }
});
// Indexes
transactionSchema.index({ txId: 1 });
transactionSchema.index({ sender: 1, status: 1 });
transactionSchema.index({ receiver: 1, status: 1 });
transactionSchema.index({ status: 1, reversalDeadline: 1 });
transactionSchema.index({ createdAt: -1 });
// Pre-save hooks
transactionSchema.pre("save", function (next) {
    if (this.isNew && this.type === "transfer") {
        this.reversalDeadline = new Date(Date.now() + 15 * 60 * 1000);
    }
    next();
});
// Static methods implementation
transactionSchema.statics.calculateFee = function (amount, currency) {
    if (isNaN(amount)) {
        throw new Error("Amount must be a valid number");
    }
    const feePercentage = 0.001;
    const minFees = {
        BTC: 0.0001,
        ETH: 0.001,
        LINK: 0.1,
        BNB: 0.01,
        USDT: 1,
        USDC: 1
    };
    const calculatedFee = amount * feePercentage;
    const minimumFee = minFees[currency];
    return parseFloat(Math.max(calculatedFee, minimumFee).toFixed(8));
};
transactionSchema.statics.finalizeExpired = function () {
    return __awaiter(this, void 0, void 0, function* () {
        const now = new Date();
        // Find all completed transactions past their reversal deadline
        const transactions = yield this.find({
            status: "completed",
            reversalDeadline: { $lte: now }
        });
        if (transactions.length === 0) {
            console.log('[Transaction] No transactions to finalize at', now.toISOString());
            return { successCount: 0, finalizedTransactions: [] };
        }
        // Update all eligible transactions
        const result = yield this.updateMany({
            _id: { $in: transactions.map(t => t._id) },
            status: "completed",
            reversalDeadline: { $lte: now }
        }, { $set: { status: "finalized", finalizedAt: now } });
        console.log(`[Transaction] Finalized ${result.modifiedCount} transactions at ${now.toISOString()}`);
        // Return the updated transactions
        const updatedTransactions = yield this.find({
            _id: { $in: transactions.map(t => t._id) }
        });
        return {
            successCount: result.modifiedCount,
            finalizedTransactions: updatedTransactions
        };
    });
};
transactionSchema.statics.cancelPending = function (txId, session) {
    return __awaiter(this, void 0, void 0, function* () {
        const tx = yield this.findOneAndUpdate({ _id: txId, status: "pending" }, { $set: { status: "cancelled", cancelledAt: new Date() } }, { new: true, session });
        if (!tx) {
            throw new Error("Pending transaction not found or already processed");
        }
        return tx;
    });
};
exports.Transaction = mongoose_1.default.model("Transaction", transactionSchema);
