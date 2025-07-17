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
exports.exchangeService = void 0;
// services/exchange.service.ts
const axios_1 = __importDefault(require("axios"));
class ExchangeService {
    constructor() {
        this.cache = new Map();
        this.lastUpdated = 0;
        this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    }
    getRates(cryptos_1) {
        return __awaiter(this, arguments, void 0, function* (cryptos, baseCurrency = 'USD') {
            if (Date.now() - this.lastUpdated > this.CACHE_TTL) {
                yield this.refreshCache(baseCurrency);
            }
            const rates = {};
            cryptos.forEach(crypto => {
                rates[crypto] = this.cache.get(`${crypto}_${baseCurrency}`) || 0;
            });
            return rates;
        });
    }
    refreshCache(baseCurrency) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Example using CoinGecko API
                const response = yield axios_1.default.get(`https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=${baseCurrency}`);
                this.cache.set(`BTC_${baseCurrency}`, response.data.bitcoin[baseCurrency.toLowerCase()]);
                this.cache.set(`ETH_${baseCurrency}`, response.data.ethereum[baseCurrency.toLowerCase()]);
                this.lastUpdated = Date.now();
            }
            catch (error) {
                console.error('Failed to refresh exchange rates:', error);
            }
        });
    }
}
exports.exchangeService = new ExchangeService();
