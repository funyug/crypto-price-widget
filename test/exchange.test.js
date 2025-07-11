const assert = require('assert');
const EXCHANGES = require('../exchange');
const ExchangeManager = require('../exchangeManager');

describe('Exchange Logic', function () {
  this.timeout(10000);

  it('fetches CoinGecko price and change', async () => {
    const data = await EXCHANGES.coingecko.fetch();
    assert.strictEqual(data.currency, 'USD');
    assert.strictEqual(data.symbol, '$');
    assert.strictEqual(typeof data.price, 'number');
    assert.strictEqual(typeof data.change, 'number');
  });

  it('fetches CoinDCX price and change', async () => {
    const data = await EXCHANGES.coindcx.fetch();
    assert.strictEqual(data.currency, 'INR');
    assert.strictEqual(data.symbol, '₹');
    assert.strictEqual(typeof data.price, 'number');
    assert.strictEqual(typeof data.change, 'number');
  });

  it('displays the correct price symbol when switching exchanges', async () => {
    // Simulate default (CoinGecko)
    const cg = await EXCHANGES.coingecko.fetch();
    // Simulate switch to CoinDCX
    const dcx = await EXCHANGES.coindcx.fetch();
    // The price symbol should change from $ to ₹
    assert.notStrictEqual(cg.symbol, dcx.symbol, 'Symbols should differ between exchanges');
    // The price string formatting should match the symbol
    const cgPriceStr = `${cg.symbol}${cg.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const dcxPriceStr = `${dcx.symbol}${dcx.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    assert(cgPriceStr.startsWith('$'), 'CoinGecko price should start with $');
    assert(dcxPriceStr.startsWith('₹'), 'CoinDCX price should start with ₹');
  });

  it('switches exchange and updates displayed price symbol', async () => {
    const manager = new ExchangeManager();
    // Default should be CoinGecko
    let priceStr = await manager.getDisplayPrice();
    assert(priceStr.startsWith('$'), 'Default should be USD');
    // Switch to CoinDCX
    manager.select('coindcx');
    priceStr = await manager.getDisplayPrice();
    assert(priceStr.startsWith('₹'), 'Should switch to INR after selecting CoinDCX');
    // Switch back to CoinGecko
    manager.select('coingecko');
    priceStr = await manager.getDisplayPrice();
    assert(priceStr.startsWith('$'), 'Should switch back to USD after selecting CoinGecko');
  });
});
