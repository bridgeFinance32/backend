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
exports.getTransactionsByUser = exports.cancelTransaction = exports.reverseTransaction = exports.createTransaction = void 0;
exports.initializeTransactionSystem = initializeTransactionSystem;
const mongoose_1 = __importDefault(require("mongoose"));
const transactionModel_1 = require("../model/transactionModel");
const userModel_1 = require("../model/userModel");
const crypto_1 = __importDefault(require("crypto"));
const node_cron_1 = __importDefault(require("node-cron"));
const sseService_1 = require("../Utils/sseService");
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
    constructor(message) {
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
let cronJob = null;
// Helper function to verify database connection
function verifyDbConnection() {
    if (mongoose_1.default.connection.readyState !== 1) {
        throw new Error('Database not connected');
    }
}
function scheduleNextFinalization() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            verifyDbConnection();
            // Cancel any existing job
            if (cronJob) {
                cronJob.stop();
                cronJob = null;
            }
            const nextTransaction = yield transactionModel_1.Transaction.findOne({
                status: "completed",
                reversalDeadline: { $gt: new Date() }
            }).sort({ reversalDeadline: 1 });
            if (!nextTransaction) {
                console.log('[Transaction] No pending finalizations found. Scheduling hourly check.');
                cronJob = node_cron_1.default.schedule('0 * * * *', () => __awaiter(this, void 0, void 0, function* () {
                    console.log('[Transaction] Running hourly finalization check');
                    try {
                        yield transactionModel_1.Transaction.finalizeExpired();
                        yield scheduleNextFinalization();
                    }
                    catch (error) {
                        console.error('[Transaction] Error during hourly finalization check:', error);
                        setTimeout(scheduleNextFinalization, 5000);
                    }
                }));
                return;
            }
            const now = new Date();
            const delay = nextTransaction.reversalDeadline.getTime() - now.getTime();
            if (delay <= 0) {
                console.log('[Transaction] Found expired transaction during scheduling. Processing immediately.');
                yield processFinalization();
                return;
            }
            console.log(`[Transaction] Next finalization scheduled for ${nextTransaction.reversalDeadline.toISOString()}`);
            const date = nextTransaction.reversalDeadline;
            const cronExpression = `${date.getMinutes()} ${date.getHours()} ${date.getDate()} ${date.getMonth() + 1} *`;
            cronJob = node_cron_1.default.schedule(cronExpression, () => __awaiter(this, void 0, void 0, function* () {
                yield processFinalization();
            }));
        }
        catch (error) {
            console.error('[Transaction] Error in scheduleNextFinalization:', error);
            if (cronJob)
                cronJob.stop();
            // Fallback to hourly checks
            cronJob = node_cron_1.default.schedule('0 * * * *', () => __awaiter(this, void 0, void 0, function* () {
                try {
                    yield transactionModel_1.Transaction.finalizeExpired();
                    yield scheduleNextFinalization();
                }
                catch (err) {
                    console.error('[Transaction] Fallback scheduler error:', err);
                }
            }));
        }
    });
}
function processFinalization() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            verifyDbConnection();
            console.log('[Transaction] Running finalization process');
            const result = yield transactionModel_1.Transaction.finalizeExpired();
            if (result.successCount > 0) {
                console.log(`[Transaction] Successfully finalized ${result.successCount} transactions`);
            }
            yield scheduleNextFinalization();
        }
        catch (error) {
            console.error('[Transaction] Error in processFinalization:', error);
            setTimeout(scheduleNextFinalization, 5000);
        }
    });
}
// Initialize the transaction system
function initializeTransactionSystem() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            verifyDbConnection();
            console.log('[Transaction] Initializing transaction system...');
            const result = yield transactionModel_1.Transaction.finalizeExpired();
            if (result.successCount > 0) {
                console.log(`[Transaction] Processed ${result.successCount} pending finalizations on startup`);
            }
            yield scheduleNextFinalization();
            console.log('[Transaction] Transaction system initialized successfully');
        }
        catch (error) {
            console.error('[Transaction] Initialization failed:', error);
            setTimeout(initializeTransactionSystem, 5000);
        }
    });
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
const createTransaction = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const session = yield mongoose_1.default.startSession();
    try {
        session.startTransaction();
        verifyDbConnection();
        const { senderId, receiverId, amount, currency } = req.body;
        // Validate inputs
        if (!senderId || !receiverId || !amount || !currency) {
            throw new InvalidTransactionStateError("Missing required fields");
        }
        const amountNum = Number(amount);
        if (isNaN(amountNum)) {
            throw new InvalidTransactionStateError("Amount must be a valid number");
        }
        const currencyKey = getCurrencyKey(currency);
        // Get users with session
        const [sender, receiver] = yield Promise.all([
            userModel_1.User.findById(senderId).session(session),
            userModel_1.User.findById(receiverId).session(session)
        ]);
        if (!sender || !receiver)
            throw new TransactionNotFoundError();
        if (sender.isBanned || receiver.isBanned) {
            throw new InvalidTransactionStateError("Account is banned");
        }
        // Calculate fee
        const fee = transactionModel_1.Transaction.calculateFee(amountNum, currency);
        const availableBalance = sender.balances[currencyKey].available;
        if (availableBalance < amountNum + fee) {
            throw new InsufficientFundsError();
        }
        // Create transaction
        const transaction = new transactionModel_1.Transaction({
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
        yield Promise.all([
            transaction.save({ session }),
            sender.save({ session })
        ]);
        // Simulate processing
        transaction.status = "completed";
        transaction.blockchainTxHash = `0x${crypto_1.default.randomBytes(32).toString('hex')}`;
        transaction.completedAt = new Date();
        // Finalize transfer
        sender.balances[currencyKey].pending -= (amountNum + fee);
        receiver.balances[currencyKey].available += amountNum;
        yield Promise.all([
            transaction.save({ session }),
            sender.save({ session }),
            receiver.save({ session }),
        ]);
        yield session.commitTransaction();
        yield sseService_1.SSEService.sendBalanceUpdate(senderId);
        yield sseService_1.SSEService.sendBalanceUpdate(receiverId);
        // Notify receiver about received transaction
        yield sseService_1.SSEService.sendTransactionNotification(receiverId, 'received', {
            amount: amountNum,
            currency,
            txId: transaction.txId,
            counterparty: senderId // assuming sender has username field
        });
        // Schedule next finalization check
        yield scheduleNextFinalization();
        res.status(201).json({
            status: "success",
            data: { transaction }
        });
    }
    catch (error) {
        yield session.abortTransaction();
        console.error('Transaction error:', error);
        handleErrorResponse(res, error instanceof Error ? error : new Error('Unknown error'));
    }
    finally {
        session.endSession();
    }
});
exports.createTransaction = createTransaction;
const reverseTransaction = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const session = yield mongoose_1.default.startSession();
    try {
        session.startTransaction();
        verifyDbConnection();
        const { txId } = req.params;
        const originalTx = yield transactionModel_1.Transaction.findOne({ txId }).session(session);
        if (!originalTx)
            throw new TransactionNotFoundError();
        if (originalTx.status !== "completed") {
            throw new InvalidTransactionStateError("Only completed transactions can be reversed");
        }
        if (originalTx.reversalDeadline && originalTx.reversalDeadline <= new Date()) {
            throw new ReversalWindowExpiredError();
        }
        const currencyKey = getCurrencyKey(originalTx.currency);
        const [sender, receiver] = yield Promise.all([
            userModel_1.User.findById(originalTx.receiver).session(session),
            userModel_1.User.findById(originalTx.sender).session(session)
        ]);
        if (!sender || !receiver)
            throw new TransactionNotFoundError();
        if (sender.balances[currencyKey].available < originalTx.amount) {
            throw new InsufficientFundsError();
        }
        // Create reversal transaction
        const reversalTx = new transactionModel_1.Transaction({
            sender: originalTx.receiver,
            receiver: originalTx.sender,
            amount: originalTx.amount,
            fee: 0,
            currency: originalTx.currency,
            type: "reversal",
            reversalOf: originalTx._id,
            status: "completed",
            blockchainTxHash: `0x${crypto_1.default.randomBytes(32).toString('hex')}`,
            completedAt: new Date()
        });
        // Update balances
        sender.balances[currencyKey].available -= originalTx.amount;
        receiver.balances[currencyKey].available += originalTx.amount;
        originalTx.status = "reversed";
        originalTx.reversedAt = new Date();
        yield Promise.all([
            reversalTx.save({ session }),
            originalTx.save({ session }),
            sender.save({ session }),
            receiver.save({ session })
        ]);
        yield session.commitTransaction();
        res.status(201).json({ status: "success", data: { transaction: reversalTx } });
        yield sseService_1.SSEService.sendBalanceUpdate(originalTx.receiver.toString());
        yield sseService_1.SSEService.sendBalanceUpdate(originalTx.sender.toString());
        yield sseService_1.SSEService.sendTransactionNotification(originalTx.sender.toString(), 'reversed', {
            amount: originalTx.amount,
            currency: originalTx.currency,
            txId: reversalTx.txId,
            counterparty: originalTx === null || originalTx === void 0 ? void 0 : originalTx.id // assuming receiver has username field
        });
    }
    catch (error) {
        yield session.abortTransaction();
        handleErrorResponse(res, error instanceof Error ? error : new Error('Unknown error'));
    }
    finally {
        session.endSession();
    }
});
exports.reverseTransaction = reverseTransaction;
const cancelTransaction = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const session = yield mongoose_1.default.startSession();
    try {
        session.startTransaction();
        verifyDbConnection();
        const { txId } = req.params;
        const tx = yield transactionModel_1.Transaction.cancelPending(txId, session);
        const sender = yield userModel_1.User.findById(tx.sender).session(session);
        if (!sender)
            throw new TransactionNotFoundError();
        const currencyKey = getCurrencyKey(tx.currency);
        // Refund
        sender.balances[currencyKey].available += (tx.amount + tx.fee);
        sender.balances[currencyKey].pending -= (tx.amount + tx.fee);
        yield sender.save({ session });
        yield session.commitTransaction();
        yield sseService_1.SSEService.sendBalanceUpdate(tx.sender.toString());
        res.status(200).json({ status: "success", data: { transaction: tx } });
    }
    catch (error) {
        yield session.abortTransaction();
        handleErrorResponse(res, error instanceof Error ? error : new Error('Unknown error'));
    }
    finally {
        session.endSession();
    }
});
exports.cancelTransaction = cancelTransaction;
const getTransactionsByUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        verifyDbConnection();
        const userId = req.params.userId;
        const transactions = yield transactionModel_1.Transaction.find({
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
    }
    catch (error) {
        handleErrorResponse(res, error instanceof Error ? error : new Error('Unknown error'));
    }
});
exports.getTransactionsByUser = getTransactionsByUser;
// Helper functions
function getCurrencyKey(currency) {
    const key = currency.toLowerCase();
    if (isCurrencyCode(key)) {
        return key;
    }
    throw new InvalidTransactionStateError(`Invalid currency: ${currency}`);
}
function isCurrencyCode(currency) {
    return ["btc", "eth", "link", "bnb", "usdt", "usdc"].includes(currency.toLowerCase());
}
function handleErrorResponse(res, err) {
    const statusCode = err instanceof TransactionNotFoundError ? 404 :
        err instanceof InvalidTransactionStateError ||
            err instanceof InsufficientFundsError ||
            err instanceof ReversalWindowExpiredError ? 400 : 500;
    res.status(statusCode).json({
        status: statusCode === 500 ? "error" : "fail",
        message: err.message
    });
}
