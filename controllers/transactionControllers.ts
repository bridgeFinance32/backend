import { Request, Response } from "express";
import eventBus from "../Utils/eventBus";
import mongoose from "mongoose";
import { ITransaction, Transaction } from "../model/transactionModel";
import { IUser, User } from "../model/userModel";
import crypto from "crypto";
import cron, { ScheduledTask } from "node-cron";
import { SSEService } from "../Utils/sseService";
import TransactionEventService from "../Utils/TransactionService";
interface AuthenticatedRequest extends Request {
  user: IUser
}
// Type Definitions
type CurrencyCode = 'btc' | 'eth' | 'link' | 'bnb' | 'usdt' | 'usdc';

interface Balance {
  available: number;
  pending: number;
}

interface UserBalances {
  btc: Balance;
  eth: Balance;
  link: Balance;
  bnb: Balance;
  usdt: Balance;
  usdc: Balance;
}

// Error Classes
class InsufficientFundsError extends Error {
  constructor() {
    super("Insufficient available balance");
    this.name = "InsufficientFundsError";
  }
}

class TransactionNotFoundError extends Error {
  constructor() {
    super("Transaction not found");
    this.name = "TransactionNotFoundError";
  }
}

class InvalidTransactionStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTransactionStateError";
  }
}

class ReversalWindowExpiredError extends Error {
  constructor() {
    super("Reversal window expired (15 minutes)");
    this.name = "ReversalWindowExpiredError";
  }
}

// Cron job management
let cronJob: ScheduledTask | null = null;

// Helper function to verify database connection
function verifyDbConnection() {
  if (mongoose.connection.readyState !== 1) {
    throw new Error('Database not connected');
  }
}

async function scheduleNextFinalization() {
  try {
    verifyDbConnection();

    // Cancel any existing job
    if (cronJob) {
      cronJob.stop();
      cronJob = null;
    }

    const nextTransaction = await Transaction.findOne({
      status: "completed",
      reversalDeadline: { $gt: new Date() }
    }).sort({ reversalDeadline: 1 });

    if (!nextTransaction) {
      console.log('[Transaction] No pending finalizations found. Scheduling hourly check.');
      cronJob = cron.schedule('0 * * * *', async () => {
        console.log('[Transaction] Running hourly finalization check');
        try {
          await Transaction.finalizeExpired();
          await scheduleNextFinalization();
        } catch (error) {
          console.error('[Transaction] Error during hourly finalization check:', error);
          setTimeout(scheduleNextFinalization, 5000);
        }
      });
      return;
    }

    const now = new Date();
    const delay = nextTransaction.reversalDeadline.getTime() - now.getTime();

    if (delay <= 0) {
      console.log('[Transaction] Found expired transaction during scheduling. Processing immediately.');
      await processFinalization();
      return;
    }

    console.log(`[Transaction] Next finalization scheduled for ${nextTransaction.reversalDeadline.toISOString()}`);

    const date = nextTransaction.reversalDeadline;
    const cronExpression = `${date.getMinutes()} ${date.getHours()} ${date.getDate()} ${date.getMonth() + 1} *`;

    cronJob = cron.schedule(cronExpression, async () => {
      await processFinalization();
    });

  } catch (error) {
    console.error('[Transaction] Error in scheduleNextFinalization:', error);
    if (cronJob) cronJob.stop();
    // Fallback to hourly checks
    cronJob = cron.schedule('0 * * * *', async () => {
      try {
        await Transaction.finalizeExpired();
        await scheduleNextFinalization();
      } catch (err) {
        console.error('[Transaction] Fallback scheduler error:', err);
      }
    });
  }
}

async function processFinalization() {
  try {
    verifyDbConnection();
    console.log('[Transaction] Running finalization process');
    const result = await Transaction.finalizeExpired();

    if (result.successCount > 0) {
      console.log(`[Transaction] Successfully finalized ${result.successCount} transactions`);
    }

    await scheduleNextFinalization();
  } catch (error) {
    console.error('[Transaction] Error in processFinalization:', error);
    setTimeout(scheduleNextFinalization, 5000);
  }
}

// Initialize the transaction system
export async function initializeTransactionSystem() {
  try {
    verifyDbConnection();
    console.log('[Transaction] Initializing transaction system...');

    const result = await Transaction.finalizeExpired();
    if (result.successCount > 0) {
      console.log(`[Transaction] Processed ${result.successCount} pending finalizations on startup`);
    }

    await scheduleNextFinalization();
    console.log('[Transaction] Transaction system initialized successfully');
  } catch (error) {
    console.error('[Transaction] Initialization failed:', error);
    setTimeout(initializeTransactionSystem, 5000);
  }
}

// Cleanup on process termination
process.on('SIGINT', () => {
  if (cronJob) {
    cronJob.stop();
    console.log('[Transaction] Cron job stopped due to process termination');
  }
  process.exit();
});

// Controller Methods
export const createTransaction = async (req: Request, res: Response) => {
  verifyDbConnection();
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { senderId, receiverId, amount, currency } = req.body;

    // Validate inputs
    if (!senderId || !receiverId || !amount || !currency) {
      throw new InvalidTransactionStateError("Missing required fields");
    }

    const amountNum = Number(amount);
    if (isNaN(amountNum)) {
      throw new InvalidTransactionStateError("Amount must be a valid number");
    }

    if (amountNum <= 0) throw new Error("Amount must be > 0");

    const currencyKey = getCurrencyKey(currency);

    // Get users with session
    const [sender, receiver] = await Promise.all([
      User.findById(senderId).session(session),
      User.findById(receiverId).session(session)
    ]);

    if (!sender || !receiver) throw new TransactionNotFoundError();
    if (sender.isBanned || receiver.isBanned) {
      throw new InvalidTransactionStateError("Account is banned");
    }

    // Calculate fee
    const fee = Transaction.calculateFee(amountNum, currency);
    const availableBalance = sender.balances[currencyKey].available;

    if (availableBalance < amountNum + fee) {
      throw new InsufficientFundsError();
    }
    if (senderId === receiverId) {
      throw new InvalidTransactionStateError("Sender and receiver cannot be the same");
    }


    // Create transaction
    const transaction = new Transaction({
      sender: senderId,
      receiver: receiverId,
      amount: amountNum,
      fee,
      currency,
      type: "transfer"
    });

    // Update balances
    sender.balances[currencyKey].available -= (amountNum + fee);
    sender.balances[currencyKey].pending += (amountNum + fee);

    await Promise.all([
      transaction.save({ session }),
      sender.save({ session })
    ]);

    // Simulate processing
    transaction.status = "completed";
    transaction.blockchainTxHash = `0x${crypto.randomBytes(32).toString('hex')}`;
    transaction.completedAt = new Date();

    // Finalize transfer
    sender.balances[currencyKey].pending -= (amountNum + fee);
    receiver.balances[currencyKey].available += amountNum;

    await Promise.all([
      transaction.save({ session }),
      sender.save({ session }),
      receiver.save({ session }),
    ]);

    await session.commitTransaction();
    await SSEService.sendBalanceUpdate(senderId);
    await SSEService.sendBalanceUpdate(receiverId);

    // Notify receiver about received transaction
    try {
      // Notify receiver about received funds
      TransactionEventService.sendTransactionEvent(
        receiverId.toString(),
        {
          type: 'deposit',
          status: 'completed',
          amount: amountNum,
          currency,
          txHash: transaction.blockchainTxHash,
          fromAddress: sender.id.toString(),
          toAddress: receiver.id.toString()
        }
      );
    } catch (e) {
      console.error('Failed to send transaction events:', e);
    }


    // Schedule next finalization check
    await scheduleNextFinalization();

    res.status(201).json({
      status: "success",
      data: { transaction }
    });
  } catch (error: unknown) {
    await session.abortTransaction();
    console.error('Transaction error:', error);
    handleErrorResponse(res, error instanceof Error ? error : new Error('Unknown error'));
  } finally {
    session.endSession();
  }
};

export const reverseTransaction = async (req: Request, res: Response) => {
   verifyDbConnection();
  const session = await mongoose.startSession();
  const AuthReq = req as AuthenticatedRequest;

  try {
    session.startTransaction();

    const { txId } = req.params;

    // Find the transaction to reverse
    const transaction = await Transaction.findOne({ txId }).session(session);
    if (!transaction) throw new TransactionNotFoundError();

    // Determine the original transaction (follow reversal chain if needed)
    let originalTx: ITransaction = transaction;
    if (transaction.type === "reversal" && transaction.reversalOf) {
      const foundOriginalTx = await Transaction.findById(transaction.reversalOf).session(session);
      if (!foundOriginalTx) throw new TransactionNotFoundError();
      originalTx = foundOriginalTx;
    }

    // Prevent reversal of a reversal transaction
    if (transaction.type === "reversal") {
      throw new InvalidTransactionStateError("Reversal transactions cannot be reversed");
    }

    // Check if transaction has already been reversed
    if (transaction.status === "reversed") {
      throw new InvalidTransactionStateError("Transaction has already been reversed");
    }

    // Verify the current user is the original sender (User A)
    if (originalTx.sender.toString() !== AuthReq.user.id) {
      throw new InvalidTransactionStateError("Only the original sender can reverse this transaction");
    }

    // Validate transaction state
    if (transaction.status !== "completed") {
      throw new InvalidTransactionStateError("Only completed transactions can be reversed");
    }
    if (transaction.reversalDeadline && transaction.reversalDeadline <= new Date()) {
      throw new ReversalWindowExpiredError();
    }

    const currencyKey = getCurrencyKey(transaction.currency);

    // Get both parties (original sender becomes receiver in reversal)
    const [currentSender, currentReceiver] = await Promise.all([
      User.findById(transaction.receiver).session(session), // Original receiver (now sender)
      User.findById(transaction.sender).session(session),  // Original sender (now receiver)
    ]);

    if (!currentSender || !currentReceiver) throw new TransactionNotFoundError();

    // Check if the original receiver has sufficient balance
    if (currentSender.balances[currencyKey].available < transaction.amount) {
      throw new InsufficientFundsError();
    }

    // Create reversal transaction (roles are flipped)
    const reversalTx = new Transaction({
      sender: transaction.receiver,    // Original receiver (User B)
      receiver: transaction.sender,    // Original sender (User A)
      amount: transaction.amount,
      fee: 0,
      currency: transaction.currency,
      type: "reversal",
      reversalOf: transaction._id,
      status: "completed",
      blockchainTxHash: `0x${crypto.randomBytes(32).toString('hex')}`,
      completedAt: new Date(),
      reversalDeadline: null, // Prevent further reversals
    });

    // Update balances (reverse the original flow)
    currentSender.balances[currencyKey].available -= transaction.amount;
    currentReceiver.balances[currencyKey].available += transaction.amount;
    transaction.status = "reversed";
    transaction.reversedAt = new Date();

    // Save all changes atomically
    await Promise.all([
      reversalTx.save({ session }),
      transaction.save({ session }),
      currentSender.save({ session }),
      currentReceiver.save({ session }),
    ]);

    await session.commitTransaction();

    // Notify both parties
    await SSEService.sendBalanceUpdate(transaction.receiver.toString());
    await SSEService.sendBalanceUpdate(transaction.sender.toString());

    TransactionEventService.sendTransactionEvent(transaction.receiver.toString(), {
      type: "withdrawal",
      status: "completed",
      amount: transaction.amount,
      currency: transaction.currency,
      txHash: reversalTx.blockchainTxHash,
      fromAddress: transaction.receiver.toString(),
      toAddress: transaction.sender.toString(),
    });

    res.status(201).json({ status: "success", data: { transaction: reversalTx } });
  } catch (error: unknown) {
    await session.abortTransaction();
    handleErrorResponse(res, error instanceof Error ? error : new Error("Unknown error"));
  } finally {
    session.endSession();
  }
};

export const cancelTransaction = async (req: Request, res: Response) => {
  verifyDbConnection();
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { txId } = req.params;
    const tx = await Transaction.cancelPending(txId, session);
    const sender = await User.findById(tx.sender).session(session);

    if (!sender) throw new TransactionNotFoundError();

    const currencyKey = getCurrencyKey(tx.currency);

    // Refund
    sender.balances[currencyKey].available += (tx.amount + tx.fee);
    sender.balances[currencyKey].pending -= (tx.amount + tx.fee);

    await sender.save({ session });
    await session.commitTransaction();
    await SSEService.sendBalanceUpdate(tx.sender.toString());
    res.status(200).json({ status: "success", data: { transaction: tx } });
  } catch (error: unknown) {
    await session.abortTransaction();
    handleErrorResponse(res, error instanceof Error ? error : new Error('Unknown error'));
  } finally {
    session.endSession();
  }
};

export const getTransactionsByUser = async (req: Request, res: Response) => {
  try {
    verifyDbConnection();
    const userId = req.params.userId;

    const transactions = await Transaction.find({
      $or: [
        { sender: userId },
        { receiver: userId }
      ]
    })
      .populate("sender", "username email")
      .populate("receiver", "username email")
      .sort({ createdAt: -1 });

    if (!transactions || transactions.length === 0) {
      throw new TransactionNotFoundError();
    }

    res.status(200).json({
      status: "success",
      results: transactions.length,
      data: { transactions }
    });
  } catch (error: unknown) {
    handleErrorResponse(res, error instanceof Error ? error : new Error('Unknown error'));
  }
};

// Helper functions
function getCurrencyKey(currency: string): CurrencyCode {
  const key = currency.toLowerCase();
  if (isCurrencyCode(key)) {
    return key;
  }
  throw new InvalidTransactionStateError(`Invalid currency: ${currency}`);
}

function isCurrencyCode(currency: string): currency is CurrencyCode {
  return ["btc", "eth", "link", "bnb", "usdt", "usdc"].includes(currency.toLowerCase());
}

function handleErrorResponse(res: Response, err: Error) {
  const statusCode = err instanceof TransactionNotFoundError ? 404 :
    err instanceof InvalidTransactionStateError ||
      err instanceof InsufficientFundsError ||
      err instanceof ReversalWindowExpiredError ? 400 : 500;

  res.status(statusCode).json({
    status: statusCode === 500 ? "error" : "fail",
    message: err.message
  });
}