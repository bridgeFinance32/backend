import { WebSocketServer, WebSocket } from 'ws';
import { User } from "./model/userModel";
import axios from "axios";
import { URL } from 'url';
import { EventEmitter } from 'events';



interface Balance {
    available: number;
    pending: number;
}

interface UserBalances {
    [key: string]: Balance;
}
import eventBus from './Utils/eventBus';
import { Server } from 'http';

interface PriceData {
    [key: string]: {
        usd: number;
    };
}

interface WebSocketMessage {
    type: 'balance_update' | 'error';
    data: any;
}

// Map your symbols to CoinGecko IDs
const symbolToIdMap: Record<string, string> = {
    btc: "bitcoin",
    eth: "ethereum",
    link: "chainlink",
    bnb: "binancecoin",
    usdt: "tether",
    usdc: "usd-coin",
};

// Cache and connection tracking
let cachedPrices: Record<string, number> = {};
    // Listen for transactionCreated event
    eventBus.on('transactionCreated', (transaction) => {
        const receiverId = transaction.receiver?.toString?.() || transaction.receiver;
        const wsList = connectedClients.get(receiverId);
        if (wsList && wsList.length > 0) {
            wsList.forEach(ws => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'transactionNotification',
                        data: transaction
                    }));
                }
            });
        }
    });
let lastFetchTime: number = 0;
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes
const connectedClients = new Map<string, WebSocket[]>();
const balanceUpdateEmitter = new EventEmitter();

const fetchPricesFromCoinGecko = async (coinIds: string[]): Promise<Record<string, number>> => {
    const idsParam = coinIds.join(",");
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${idsParam}&vs_currencies=usd`;

    try {
        const response = await axios.get<PriceData>(url);
        const data = response.data;

        const prices: Record<string, number> = {};
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
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error("CoinGecko fetch failed:", errorMessage);
        throw error;
    }
};

const sendToClient = (ws: WebSocket, message: WebSocketMessage) => {
    if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(message));
    }
};

const sendError = (ws: WebSocket, message: string) => {
    sendToClient(ws, {
        type: 'error',
        data: { message }
    });
};

const processUserBalances = async (userId: string): Promise<WebSocketMessage | null> => {
    const user = await User.findById(userId);
    if (!user) return null;

    const balances = user.balances || {};
    const coinIds = Object.keys(balances)
        .map((key) => symbolToIdMap[key.toLowerCase()])
        .filter(Boolean) as string[];

    if (coinIds.length === 0) return null;

    const prices = Date.now() - lastFetchTime < CACHE_DURATION
        ? cachedPrices
        : await fetchPricesFromCoinGecko(coinIds);

    let totalAvailableUSD = 0;
    let totalPendingUSD = 0;

    for (const [coin, { available, pending }] of Object.entries(balances)) {
        const cgId = symbolToIdMap[coin.toLowerCase()];
        if (!cgId || !prices[cgId]) continue;

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
};

const updateUserClients = async (userId: string) => {
    try {
        const message = await processUserBalances(userId);
        if (!message) return;

        const clients = connectedClients.get(userId) || [];
        clients.forEach(client => {
            sendToClient(client, message);
        });
    } catch (error) {
        console.error(`Error updating clients for user ${userId}:`, error);
    }
};

const setupDatabaseChangeListeners = () => {
    // MongoDB change stream (requires replica set)
    try {
        const userChangeStream = User.watch([], { fullDocument: 'updateLookup' });

        userChangeStream.on('change', (change) => {
            if (change.operationType === 'update') {
                const userId = change.documentKey._id.toString();
                
                // Check if balances were updated
                if (change.updateDescription?.updatedFields?.balances) {
                    balanceUpdateEmitter.emit('balances_changed', userId);
                }
            }
        });

        userChangeStream.on('error', (error) => {
            console.error('Change stream error:', error);
            // Implement reconnection logic here
        });
    } catch (error) {
        console.error('Failed to setup change streams:', error);
    }
};

export const createWebSocketServer = (server: Server) => {
    console.log('[WebSocket] Initializing WebSocket server...');
    const wss = new WebSocketServer({ server });

    console.log('[WebSocket] Setting up database change listeners...');
    setupDatabaseChangeListeners();

    // Event listeners for balance and price changes
    balanceUpdateEmitter.on('balances_changed', (userId) => {
        console.log(`[WebSocket] balances_changed event received for user ${userId}`);
        updateUserClients(userId);
    });

    balanceUpdateEmitter.on('prices_updated', () => {
        console.log('[WebSocket] prices_updated event received');
        // Update all clients when prices change
        connectedClients.forEach((_, userId) => {
            console.log(`[WebSocket] Updating client for user ${userId} due to price change`);
            updateUserClients(userId);
        });
    });

    // Regular price refresh (every 2 minutes)
    const priceRefreshInterval = setInterval(() => {
        console.log('[WebSocket] Running scheduled price refresh...');
        const coinIds = Array.from(new Set(
            Object.values(symbolToIdMap).filter(Boolean)
        ));
        if (coinIds.length) {
            fetchPricesFromCoinGecko(coinIds)
                .then(() => console.log('[WebSocket] Price refresh completed successfully'))
                .catch(err => console.error('[WebSocket] Price refresh failed:', err));
        }
    }, CACHE_DURATION);

    wss.on('connection', (ws: WebSocket, req) => {
        const clientIp = req.socket.remoteAddress;
        console.log(`[WebSocket] New connection from ${clientIp}`);

        try {
            const url = new URL(req.url || '', `http://${req.headers.host}`);
            const userId = url.searchParams.get('userId');

            if (!userId) {
                console.log('[WebSocket] Connection rejected - missing userId');
                sendError(ws, "User ID is required");
                return ws.close();
            }

            console.log(`[WebSocket] User ${userId} connected`);

            // Add to connected clients
            if (!connectedClients.has(userId)) {
                console.log(`[WebSocket] First connection for user ${userId}`);
                connectedClients.set(userId, []);
            }
            connectedClients.get(userId)?.push(ws);

            console.log(`[WebSocket] Currently connected clients: ${Array.from(connectedClients.keys()).join(', ')}`);

            // Send initial data
            updateUserClients(userId);

            // Clean up on close
            ws.on('close', () => {
                console.log(`[WebSocket] User ${userId} disconnected`);
                const userClients = connectedClients.get(userId) || [];
                connectedClients.set(userId, userClients.filter(client => client !== ws));
                if (connectedClients.get(userId)?.length === 0) {
                    console.log(`[WebSocket] No more connections for user ${userId}`);
                    connectedClients.delete(userId);
                }
                console.log(`[WebSocket] Remaining clients: ${Array.from(connectedClients.keys()).join(', ')}`);
            });

            ws.on('error', (error) => {
                console.error(`[WebSocket] Error for user ${userId}:`, error);
            });

            ws.on('pong', () => {
                console.log(`[WebSocket] Received pong from user ${userId}`);
            });

        } catch (error) {
            console.error("[WebSocket] Connection setup error:", error);
            sendError(ws, "Internal server error");
            ws.close();
        }
    });

    // Health check ping
    const pingInterval = setInterval(() => {
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.ping();
                console.log('[WebSocket] Sent ping to client');
            }
        });
    }, 30000); // Every 30 seconds

    // Cleanup on server close
    wss.on('close', () => {
        console.log('[WebSocket] Server shutting down...');
        clearInterval(priceRefreshInterval);
        clearInterval(pingInterval);
        connectedClients.clear();
    });

    console.log('[WebSocket] Server successfully created and ready for connections');
    return wss;
};