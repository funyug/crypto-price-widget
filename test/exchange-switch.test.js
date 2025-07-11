const path = require('path');
const { Application } = require('spectron');
const assert = require('assert');

describe('Exchange Switching', function () {
  this.timeout(20000);
  let app;

  before(async () => {
    const extraArgs = [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1024,768'
    ];
    app = new Application({
      path: require('electron'),
      args: [path.join(__dirname, '..'), ...extraArgs],
      env: {
        NODE_ENV: 'test',
        ELECTRON_EXTRA_LAUNCH_ARGS: extraArgs.join(' ')
      }
    });
    await app.start();
    await app.client.waitUntilWindowLoaded();
  });

  after(async () => {
    if (app && app.isRunning()) {
      await app.stop();
    }
  });

  it('shows CoinGecko price by default', async () => {
    const priceText = await app.client.$('#price').then(el => el.getText());
    assert(priceText.startsWith('$'), 'Default price should be in USD');
  });

  it('switches to CoinDCX and shows INR price', async () => {
    // Simulate exchange switch via IPC
    await app.electron.ipcRenderer.send('switch-exchange', 'coindcx');
    await app.client.pause(2000); // wait for update
    const priceText = await app.client.$('#price').then(el => el.getText());
    assert(priceText.startsWith('₹'), 'Price should be in INR after switching to CoinDCX');
  });

  it('switches back to CoinGecko and shows USD price', async () => {
    await app.electron.ipcRenderer.send('switch-exchange', 'coingecko');
    await app.client.pause(2000);
    const priceText = await app.client.$('#price').then(el => el.getText());
    assert(priceText.startsWith('$'), 'Price should be in USD after switching back to CoinGecko');
  });
});
