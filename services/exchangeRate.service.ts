// services/exchange.service.ts
import axios from 'axios';

class ExchangeService {
  private cache = new Map<string, number>();
  private lastUpdated = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async getRates(cryptos: string[], baseCurrency: string = 'USD'): Promise<Record<string, number>> {
    if (Date.now() - this.lastUpdated > this.CACHE_TTL) {
      await this.refreshCache(baseCurrency);
    }

    const rates: Record<string, number> = {};
    cryptos.forEach(crypto => {
      rates[crypto] = this.cache.get(`${crypto}_${baseCurrency}`) || 0;
    });

    return rates;
  }

  private async refreshCache(baseCurrency: string): Promise<void> {
    try {
      // Example using CoinGecko API
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=${baseCurrency}`
      );

      this.cache.set(`BTC_${baseCurrency}`, response.data.bitcoin[baseCurrency.toLowerCase()]);
      this.cache.set(`ETH_${baseCurrency}`, response.data.ethereum[baseCurrency.toLowerCase()]);
      this.lastUpdated = Date.now();
    } catch (error) {
      console.error('Failed to refresh exchange rates:', error);
    }
  }
}

export const exchangeService = new ExchangeService();