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
exports.accountController = void 0;
const userModel_1 = require("../model/userModel");
const axios_1 = __importDefault(require("axios"));
// Map your symbols to CoinGecko IDs
const symbolToIdMap = {
    btc: "bitcoin",
    eth: "ethereum",
    link: "chainlink",
    bnb: "binancecoin",
    usdt: "tether",
    usdc: "usd-coin",
};
// 🧠 Simple in-memory cache
let cachedPrices = {};
let lastFetchTime = 0;
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes
const fetchPricesFromCoinGecko = (coinIds) => __awaiter(void 0, void 0, void 0, function* () {
    const idsParam = coinIds.join(",");
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${idsParam}&vs_currencies=usd`;
    console.log("Fetching CoinGecko prices with URL:", url);
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
        return prices;
    }
    catch (error) {
        console.error("CoinGecko fetch failed:", error.message || error);
        throw new Error("Failed to fetch prices from CoinGecko");
    }
});
const accountController = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const user = yield userModel_1.User.findById(id);
        if (!user) {
            res.status(404).json({ message: "User not found" });
            return;
        }
        const balances = user.balances;
        // Map symbols to CoinGecko IDs & filter out any unknown keys
        const coinIds = Object.keys(balances)
            .map((key) => symbolToIdMap[key.toLowerCase()])
            .filter(Boolean);
        if (coinIds.length === 0) {
            throw new Error("No valid coins found in user balances");
        }
        const now = Date.now();
        const prices = now - lastFetchTime < CACHE_DURATION
            ? cachedPrices
            : yield fetchPricesFromCoinGecko(coinIds);
        let totalAvailableUSD = 0;
        let totalPendingUSD = 0;
        for (const [coin, { available, pending }] of Object.entries(balances)) {
            const cgId = symbolToIdMap[coin.toLowerCase()];
            if (!cgId) {
                throw new Error(`Unsupported coin symbol: ${coin}`);
            }
            const price = prices[cgId];
            if (price === undefined) {
                throw new Error(`Price not found for coin: ${coin}`);
            }
            totalAvailableUSD += available * price;
            totalPendingUSD += pending * price;
        }
        res.status(200).json({
            totalAvailableUSD: totalAvailableUSD.toFixed(2),
            totalPendingUSD: totalPendingUSD.toFixed(2),
        });
    }
    catch (err) {
        console.error("Error in accountController:", err);
        next(err);
    }
});
exports.accountController = accountController;
const sseClients = new Map();
