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
exports.createWebSocketServer = void 0;
const ws_1 = require("ws");
const userModel_1 = require("./model/userModel");
const axios_1 = __importDefault(require("axios"));
const url_1 = require("url");
const events_1 = require("events");
const eventBus_1 = __importDefault(require("./Utils/eventBus"));
// Map your symbols to CoinGecko IDs
const symbolToIdMap = {
    btc: "bitcoin",
    eth: "ethereum",
    link: "chainlink",
    bnb: "binancecoin",
    usdt: "tether",
    usdc: "usd-coin",
};
// Cache and connection tracking
let cachedPrices = {};
// Listen for transactionCreated event
eventBus_1.default.on('transactionCreated', (transaction) => {
    var _a, _b;
    const receiverId = ((_b = (_a = transaction.receiver) === null || _a === void 0 ? void 0 : _a.toString) === null || _b === void 0 ? void 0 : _b.call(_a)) || transaction.receiver;
    const wsList = connectedClients.get(receiverId);
    if (wsList && wsList.length > 0) {
        wsList.forEach(ws => {
            if (ws.readyState === ws_1.WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'transactionNotification',
                    data: transaction
                }));
            }
        });
    }
});
let lastFetchTime = 0;
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes
const connectedClients = new Map();
const balanceUpdateEmitter = new events_1.EventEmitter();
const fetchPricesFromCoinGecko = (coinIds) => __awaiter(void 0, void 0, void 0, function* () {
    const idsParam = coinIds.join(",");
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${idsParam}&vs_currencies=usd`;
    try {
        const response = yield axios_1.default.get(url);
        const data = response.data;
        const prices = {};
        for (const id of coinIds) {
            if (!data[id] || typeof data[id].usd !== "number") {
                throw new Error(`Missing price data for coin: ${id}`);
            }
            prices[id] = data[id].usd;
        }
        cachedPrices = prices;
        lastFetchTime = Date.now();
        // Emit event when prices are updated
        balanceUpdateEmitter.emit('prices_updated');
        return prices;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error("CoinGecko fetch failed:", errorMessage);
        throw error;
    }
});
const sendToClient = (ws, message) => {
    if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(message));
    }
};
const sendError = (ws, message) => {
    sendToClient(ws, {
        type: 'error',
        data: { message }
    });
};
const processUserBalances = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield userModel_1.User.findById(userId);
    if (!user)
        return null;
    const balances = user.balances || {};
    const coinIds = Object.keys(balances)
        .map((key) => symbolToIdMap[key.toLowerCase()])
        .filter(Boolean);
    if (coinIds.length === 0)
        return null;
    const prices = Date.now() - lastFetchTime < CACHE_DURATION
        ? cachedPrices
        : yield fetchPricesFromCoinGecko(coinIds);
    let totalAvailableUSD = 0;
    let totalPendingUSD = 0;
    for (const [coin, { available, pending }] of Object.entries(balances)) {
        const cgId = symbolToIdMap[coin.toLowerCase()];
        if (!cgId || !prices[cgId])
            continue;
        const price = prices[cgId];
        totalAvailableUSD += available * price;
        totalPendingUSD += pending * price;
    }
    return {
        type: 'balance_update',
        data: {
            totals: {
                available: totalAvailableUSD.toFixed(2),
                pending: totalPendingUSD.toFixed(2)
            },
            lastUpdated: new Date().toISOString()
        }
    };
});
const updateUserClients = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const message = yield processUserBalances(userId);
        if (!message)
            return;
        const clients = connectedClients.get(userId) || [];
        clients.forEach(client => {
            sendToClient(client, message);
        });
    }
    catch (error) {
        console.error(`Error updating clients for user ${userId}:`, error);
    }
});
const setupDatabaseChangeListeners = () => {
    // MongoDB change stream (requires replica set)
    try {
        const userChangeStream = userModel_1.User.watch([], { fullDocument: 'updateLookup' });
        userChangeStream.on('change', (change) => {
            var _a, _b;
            if (change.operationType === 'update') {
                const userId = change.documentKey._id.toString();
                // Check if balances were updated
                if ((_b = (_a = change.updateDescription) === null || _a === void 0 ? void 0 : _a.updatedFields) === null || _b === void 0 ? void 0 : _b.balances) {
                    balanceUpdateEmitter.emit('balances_changed', userId);
                }
            }
        });
        userChangeStream.on('error', (error) => {
            console.error('Change stream error:', error);
            // Implement reconnection logic here
        });
    }
    catch (error) {
        console.error('Failed to setup change streams:', error);
    }
};
const createWebSocketServer = () => {
    const wss = new ws_1.WebSocketServer({ port: 8080 });
    // Setup database change listeners
    setupDatabaseChangeListeners();
    // Event listeners for balance and price changes
    balanceUpdateEmitter.on('balances_changed', (userId) => {
        updateUserClients(userId);
    });
    balanceUpdateEmitter.on('prices_updated', () => {
        // Update all clients when prices change
        connectedClients.forEach((_, userId) => {
            updateUserClients(userId);
        });
    });
    // Regular price refresh (every 2 minutes)
    const priceRefreshInterval = setInterval(() => {
        const coinIds = Array.from(new Set(Object.values(symbolToIdMap).filter(Boolean)));
        if (coinIds.length) {
            fetchPricesFromCoinGecko(coinIds).catch(console.error);
        }
    }, CACHE_DURATION);
    wss.on('connection', (ws, req) => {
        var _a;
        try {
            const url = new url_1.URL(req.url || '', `http://${req.headers.host}`);
            const userId = url.searchParams.get('userId');
            if (!userId) {
                sendError(ws, "User ID is required");
                return ws.close();
            }
            // Add to connected clients
            if (!connectedClients.has(userId)) {
                connectedClients.set(userId, []);
            }
            (_a = connectedClients.get(userId)) === null || _a === void 0 ? void 0 : _a.push(ws);
            // Send initial data
            updateUserClients(userId);
            // Clean up on close
            ws.on('close', () => {
                var _a;
                const userClients = connectedClients.get(userId) || [];
                connectedClients.set(userId, userClients.filter(client => client !== ws));
                if (((_a = connectedClients.get(userId)) === null || _a === void 0 ? void 0 : _a.length) === 0) {
                    connectedClients.delete(userId);
                }
            });
            ws.on('error', (error) => {
                console.error(`WebSocket error for user ${userId}:`, error);
            });
        }
        catch (error) {
            console.error("Connection setup error:", error);
            sendError(ws, "Internal server error");
            ws.close();
        }
    });
    // Cleanup on server close
    wss.on('close', () => {
        clearInterval(priceRefreshInterval);
        connectedClients.clear();
    });
    console.log('WebSocket server created');
    return wss;
};
exports.createWebSocketServer = createWebSocketServer;
