const axios = require('axios');

const EXCHANGES = {
  coingecko: {
    name: 'CoinGecko (USD)',
    id: 'coingecko',
    currency: 'USD',
    symbol: '$',
    fetch: async () => {
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true');
      const { bitcoin } = response.data;
      return {
        price: parseFloat(bitcoin.usd),
        change: parseFloat(bitcoin.usd_24h_change),
        currency: 'USD',
        symbol: '$',
      };
    }
  },
  coindcx: {
    name: 'CoinDCX (INR)',
    id: 'coindcx',
    currency: 'INR',
    symbol: '₹',
    fetch: async () => {
      const response = await axios.get('https://api.coindcx.com/exchange/ticker');
      const btcinr = response.data.find(t => t.market === 'BTCINR');
      if (!btcinr) throw new Error('BTCINR market not found in CoinDCX response');
      return {
        price: parseFloat(btcinr.last_price),
        change: parseFloat(btcinr.change_24_hour),
        currency: 'INR',
        symbol: '₹',
      };
    }
  }
};

module.exports = EXCHANGES;
