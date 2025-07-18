import mongoose, { Document, Schema, Model, UpdateWriteOpResult, ClientSession } from "mongoose";
import { v4 as uuidv4 } from 'uuid';
import { User } from "./userModel";
import crypto from "crypto";

export type TransactionStatus = "pending" | "completed" | "failed" | "reversed" | "finalized" | "cancelled";
export type TransactionType = "transfer" | "deposit" | "withdrawal" | "fee" | "reversal";
export type CurrencyCode = "BTC" | "ETH" | "LINK" | "BNB" | "USDT" | "USDC";
export type CurrencyCodeLower = "btc" | "eth" | "link" | "bnb" | "usdt" | "usdc";

export interface ITransaction extends Document {
  txId: string;
  sender: mongoose.Types.ObjectId;
  receiver: mongoose.Types.ObjectId;
  amount: number;
  fee: number;
  currency: CurrencyCode;
  status: TransactionStatus;
  type: TransactionType;
  reversalOf?: mongoose.Types.ObjectId;
  blockchainTxHash?: string;
  failureReason?: string;
  reversalDeadline: Date;
  createdAt: Date;
  completedAt?: Date;
  reversedAt?: Date;
  cancelledAt?: Date;
  finalizedAt?: Date;
}

interface ITransactionModel extends Model<ITransaction> {
  calculateFee(amount: number, currency: CurrencyCode): number;
  finalizeExpired(): Promise<{successCount: number, finalizedTransactions: ITransaction[]}>;
  cancelPending(txId: string, session?: ClientSession): Promise<ITransaction>;
}

const transactionSchema = new Schema<ITransaction, ITransactionModel>(
  {
    txId: { 
      type: String, 
      required: true,
      unique: true,
      default: () => `tx_${uuidv4().replace(/-/g, '')}`
    },
    sender: { 
      type: Schema.Types.ObjectId, 
      ref: "User", 
      required: true,
      validate: {
        validator: async function(v: mongoose.Types.ObjectId) {
          const user = await User.findById(v);
          return !!user && !user.isBanned;
        },
        message: "Sender must be an active user"
      }
    },
    receiver: { 
      type: Schema.Types.ObjectId, 
      ref: "User", 
      required: true,
      validate: {
        validator: async function(v: mongoose.Types.ObjectId) {
          const user = await User.findById(v);
          return !!user && !user.isBanned;
        },
        message: "Receiver must be an active user"
      }
    },
    amount: { 
      type: Number, 
      required: true,
      min: [0.00000001, "Amount must be at least 0.00000001"],
      validate: {
        validator: (v: number) => {
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
      enum: ["BTC", "ETH", "LINK", "BNB", "USDT", "USDC"] as const,
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
    reversalOf: { type: Schema.Types.ObjectId, ref: "Transaction" },
    blockchainTxHash: { 
      type: String,
      validate: {
        validator: function(v?: string) {
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
  },
  { 
     timestamps: true,
    toJSON: { 
      virtuals: true, 
      transform: (doc: Document, ret: Record<string, any>) => { 
        delete ret.__v;
        // You can add other fields to remove here
        // delete ret._id; 
        return ret; 
      } 
    }
  }
);

// Indexes
transactionSchema.index({ txId: 1 });
transactionSchema.index({ sender: 1, status: 1 });
transactionSchema.index({ receiver: 1, status: 1 });
transactionSchema.index({ status: 1, reversalDeadline: 1 });
transactionSchema.index({ createdAt: -1 });

// Pre-save hooks
transactionSchema.pre<ITransaction>("save", function(next) {
  if (this.isNew && this.type === "transfer") {
    this.reversalDeadline = new Date(Date.now() + 15 * 60 * 1000);
  }
  next();
});

// Static methods implementation
transactionSchema.statics.calculateFee = function(amount: number, currency: CurrencyCode): number {
  if (isNaN(amount)) {
    throw new Error("Amount must be a valid number");
  }
  
  const feePercentage = 0.001;
  const minFees: Record<CurrencyCode, number> = {
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

transactionSchema.statics.finalizeExpired = async function(): Promise<{successCount: number, finalizedTransactions: ITransaction[]}> {
  const now = new Date();
  
  // Find all completed transactions past their reversal deadline
  const transactions = await this.find({
    status: "completed",
    reversalDeadline: { $lte: now }
  });

  if (transactions.length === 0) {
    console.log('[Transaction] No transactions to finalize at', now.toISOString());
    return { successCount: 0, finalizedTransactions: [] };
  }

  // Update all eligible transactions
  const result = await this.updateMany(
    { 
      _id: { $in: transactions.map(t => t._id) },
      status: "completed",
      reversalDeadline: { $lte: now }
    },
    { $set: { status: "finalized", finalizedAt: now } }
  );

  console.log(`[Transaction] Finalized ${result.modifiedCount} transactions at ${now.toISOString()}`);
  
  // Return the updated transactions
  const updatedTransactions = await this.find({
    _id: { $in: transactions.map(t => t._id) }
  });

  return {
    successCount: result.modifiedCount,
    finalizedTransactions: updatedTransactions
  };
};

transactionSchema.statics.cancelPending = async function(
  txId: string, 
  session?: ClientSession
): Promise<ITransaction> {
  const tx = await this.findOneAndUpdate(
    { _id: txId, status: "pending" },
    { $set: { status: "cancelled", cancelledAt: new Date() } },
    { new: true, session }
  );
  
  if (!tx) {
    throw new Error("Pending transaction not found or already processed");
  }
  
  return tx;
};

export const Transaction = mongoose.model<ITransaction, ITransactionModel>("Transaction", transactionSchema);