const EXCHANGES = require('./exchange');

class ExchangeManager {
  constructor() {
    this.selected = 'coingecko';
  }

  select(exchangeId) {
    if (!EXCHANGES[exchangeId]) throw new Error('Unknown exchange');
    this.selected = exchangeId;
  }

  async getDisplayPrice() {
    const data = await EXCHANGES[this.selected].fetch();
    return `${data.symbol}${data.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  getSelectedSymbol() {
    return EXCHANGES[this.selected].symbol;
  }
}

module.exports = ExchangeManager;
