import mongoose, { Document, Schema, Model } from "mongoose";
import bcrypt from "bcrypt";

export type UserRole = "user" | "admin" | "moderator";

export interface IUser extends Document {
  username: string;
  email: string;
  password: string;
  role: UserRole;
  isVerified: boolean;
  isBanned: boolean;
  twoFactorEnabled: boolean;
  lastPasswordChange: Date;
  lastLogin?: Date;
  balances: {
    btc: { available: number; pending: number };
    eth: { available: number; pending: number };
    link: { available: number; pending: number };
    bnb: { available: number; pending: number };
    usdt: { available: number; pending: number };
    usdc: { available: number; pending: number };
  };
  isValidPassword(password: string): Promise<boolean>;
  // Add __v as optional since we're deleting it in toJSON
  __v?: number;
}

const userSchema = new Schema<IUser>(
  {
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
        validator: (email: string) => {
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
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret: Record<string, any>) => {
        delete ret.password;
        delete ret.__v;
        delete ret._id; // Optional: remove if you want to keep _id
        ret.id = (doc._id as mongoose.Types.ObjectId).toString(); // Cast _id to string
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (doc, ret: Record<string, any>) => {
        delete ret.password;
        delete ret.__v;
        delete ret._id; // Optional: remove if you want to keep _id
        ret.id = (doc._id as mongoose.Types.ObjectId).toString(); // Cast _id to string
        return ret;
      },
    },
  }
);

// Password hashing middleware
userSchema.pre<IUser>("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    this.lastPasswordChange = new Date();
    next();
  } catch (err) {
    next(err as Error);
  }
});

// Password verification method
userSchema.methods.isValidPassword = async function(
  candidatePassword: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (err) {
    console.error("Password comparison error:", err);
    return false;
  }
};

// Indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ role: 1 });
userSchema.index({ isVerified: 1 });
userSchema.index({ isBanned: 1 });
userSchema.index({ lastLogin: -1 });
userSchema.index({ 
  role: 1, 
  isVerified: 1, 
  isBanned: 1 
});
userSchema.index({ "balances.btc.available": 1 });
userSchema.index({ "balances.eth.available": 1 });
userSchema.index({
  "balances.usdt.available": 1,
  "balances.usdc.available": 1
});

export const User = mongoose.model<IUser>("User", userSchema);
