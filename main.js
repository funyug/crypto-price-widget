const { app, Tray, Menu, nativeImage, BrowserWindow, Notification, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const Store = require('electron-store');

// Enable remote module
require('@electron/remote/main').initialize();

// Detect if running in WSL
const isWSL = process.platform === 'linux' && !!process.env.WSL_DISTRO_NAME;

// Set up logging
const log = (message) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  // Log to console and file (keep for error/state tracking)
  console.log(logMessage.trim());
  const logPath = path.join(app.getPath('userData'), 'app.log');
  fs.appendFileSync(logPath, logMessage);
};

// Log uncaught exceptions
process.on('uncaughtException', (error) => {
  log(`Uncaught Exception: ${error.message}\n${error.stack}`);
});

// Log unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

const store = new Store();
let mainWindow = null;
let tray = null;
let contextMenu = null;

// --- New: Coin lists and selection ---
let coinGeckoCoinList = [];
let coinDCXCoinList = [];
let selectedCoins = store.get('selectedCoins') || {
  coingecko: { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' },
  coindcx: { id: 'BTCINR', symbol: 'btc', name: 'Bitcoin' }
};

function showErrorAndQuit(title, message) {
  log(`${title}: ${message}`);
  if (app && app.isReady()) {
    dialog.showErrorBox(title, message);
  }
  isQuitting = true;
  app.quit();
}

const EXCHANGES = {
  coingecko: {
    name: 'CoinGecko (USD)',
    id: 'coingecko',
    currency: 'USD',
    fetch: async () => {
      // Use selected coin
      const coin = selectedCoins.coingecko || { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' };
      const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coin.id}&vs_currencies=usd&include_24hr_change=true`);
      const data = response.data[coin.id];
      if (!data) throw new Error(`Coin ${coin.id} not found in CoinGecko response`);
      return {
        price: parseFloat(data.usd),
        change: parseFloat(data.usd_24h_change),
        currency: 'USD',
        symbol: '$',
        coin: coin
      };
    }
  },
  coindcx: {
    name: 'CoinDCX (INR)',
    id: 'coindcx',
    currency: 'INR',
    fetch: async () => {
      // Use selected market
      const coin = selectedCoins.coindcx || { id: 'BTCINR', symbol: 'btc', name: 'Bitcoin' };
      const response = await axios.get('https://api.coindcx.com/exchange/ticker');
      const ticker = response.data.find(t => t.market === coin.id);
      if (!ticker) throw new Error(`${coin.id} market not found in CoinDCX response`);
      return {
        price: parseFloat(ticker.last_price),
        change: parseFloat(ticker.change_24_hour),
        currency: 'INR',
        symbol: '₹',
        coin: coin
      };
    }
  }
};
let selectedExchange = store.get('exchange');
if (!selectedExchange || !EXCHANGES[selectedExchange]) {
  selectedExchange = 'coingecko';
  store.set('exchange', 'coingecko');
}

function createTray() {
  log('Creating tray icon...');
  if (isWSL) {
    return;
  }
  try {
    let trayIconPath;
    let trayIcon;
    if (process.platform === 'win32') {
      trayIconPath = path.join(process.resourcesPath, 'assets', 'icon.ico');
      trayIcon = nativeImage.createFromPath(trayIconPath);
      if (trayIcon.isEmpty()) {
        trayIconPath = path.join(process.resourcesPath, 'assets', 'icon.png');
        trayIcon = nativeImage.createFromPath(trayIconPath);
      }
    } else {
      trayIconPath = path.join(__dirname, 'assets', 'icon.png');
      trayIcon = nativeImage.createFromPath(trayIconPath);
    }
    if (trayIcon.isEmpty()) {
      log('Tray icon failed to load.');
      return;
    }
    tray = new Tray(trayIcon);
    buildAndSetMenu(lastKnownPrice, lastKnownChange);
    tray.setToolTip('Bitcoin Price Widget');
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });
  } catch (err) {
    log(`Error creating tray: ${err.message}`);
    showErrorAndQuit('Tray Error', `Failed to create tray icon: ${err.message}`);
  }
}

let lastFetchTime = 0;
const FETCH_INTERVAL = 60000; // 60 seconds
let lastKnownPrice = null;
let lastKnownChange = null;

function buildContextMenu(priceStr, changeStr) {
  let coinLabel = '';
  if (selectedExchange === 'coingecko' && selectedCoins.coingecko) {
    coinLabel = `${selectedCoins.coingecko.name} (${selectedCoins.coingecko.symbol.toUpperCase()}/USD)`;
  } else if (selectedExchange === 'coindcx' && selectedCoins.coindcx) {
    coinLabel = `${selectedCoins.coindcx.name} (${selectedCoins.coindcx.symbol.toUpperCase()}/INR)`;
  } else {
    coinLabel = `BTC/${EXCHANGES[selectedExchange].currency}`;
  }

  const menuTemplate = [
    { label: `${coinLabel}: ${priceStr} (${changeStr})`, id: 'price', enabled: false },
    { type: 'separator' },
    {
      label: 'Exchange',
      submenu: [
        {
          label: 'CoinGecko (USD)',
          type: 'radio',
          checked: selectedExchange === 'coingecko',
          click: async () => {
            selectedExchange = 'coingecko';
            store.set('exchange', 'coingecko');
            await updatePrice(true);
            buildAndSetMenu(lastKnownPrice, lastKnownChange);
          }
        },
        {
          label: 'CoinDCX (INR)',
          type: 'radio',
          checked: selectedExchange === 'coindcx',
          click: async () => {
            selectedExchange = 'coindcx';
            store.set('exchange', 'coindcx');
            await updatePrice(true);
            buildAndSetMenu(lastKnownPrice, lastKnownChange);
          }
        }
      ]
    },
    // --- New: Coin symbol input modal ---
    {
      label: 'Set Coin Symbol...',
      click: async () => {
        if (global.symbolInputWindow && !global.symbolInputWindow.isDestroyed()) {
          global.symbolInputWindow.focus();
          return;
        }
        const { BrowserWindow } = require('electron');
        const modal = new BrowserWindow({
          width: 340,
          height: 180,
          resizable: false,
          minimizable: false,
          maximizable: false,
          parent: mainWindow,
          modal: true,
          show: false,
          frame: false,
          alwaysOnTop: true,
          skipTaskbar: true,
          webPreferences: {
            preload: path.join(__dirname, 'preload-symbol-input.js'),
            contextIsolation: true,
            nodeIntegration: false
          }
        });
        global.symbolInputWindow = modal;
        // Robust path resolution for dev and production (asar)
        const { app } = require('electron');
        let htmlPath;
        if (process.defaultApp || /node_modules[\\/]electron[\\/]/.test(process.execPath)) {
          htmlPath = path.join(__dirname, 'symbol-input.html');
        } else {
          const asarPath = path.join(app.getAppPath(), 'symbol-input.html');
          const fs = require('fs');
          if (fs.existsSync(asarPath)) {
            htmlPath = asarPath;
          } else {
            const tempPath = path.join(app.getPath('temp'), 'symbol-input.html');
            try {
              const src = path.join(app.getAppPath(), 'symbol-input.html');
              const buf = fs.readFileSync(src);
              fs.writeFileSync(tempPath, buf);
              htmlPath = tempPath;
            } catch (e) {
              htmlPath = asarPath;
            }
          }
        }
        modal.loadFile(htmlPath).catch(() => {});
        modal.once('ready-to-show', () => {
          modal.show();
        });
        modal.on('closed', () => {
          global.symbolInputWindow = null;
        });
      }
    },
    // --- End new ---
  ];

  // Add auto start checkbox for Windows
  if (process.platform === 'win32' && autoLauncher) {
    menuTemplate.push({
      label: 'Auto Start on Boot',
      type: 'checkbox',
      checked: false, // will be set below
      async click(menuItem) {
        let notificationMsg = '';
        try {
          if (menuItem.checked) {
            await autoLauncher.enable();
            notificationMsg = 'Auto start enabled.';
          } else {
            await autoLauncher.disable();
            notificationMsg = 'Auto start disabled.';
          }
        } catch (err) {
          // Silently revert the checkbox if failed
          menuItem.checked = !(menuItem.checked);
          let msg = 'Failed to change auto start.';
          if (err && err.message && /access is denied|permission/i.test(err.message)) {
            msg = 'Auto start could not be enabled or disabled due to insufficient permissions. This feature may not be available in your environment.';
          } else if (typeof err === 'string') {
            msg = err;
          } else if (err && err.message) {
            msg = err.message;
          }
          notificationMsg = msg;
          log(msg);
        }
        // Always update checked state to reflect actual status
        autoLauncher.isEnabled().then(enabled => {
          menuItem.checked = enabled;
        });
        // Show subtle notification
        if (Notification && Notification.isSupported()) {
          new Notification({
            title: 'Bitcoin Price Widget',
            body: notificationMsg,
            silent: true
          }).show();
        }
      }
    });
    // Set checked state before showing menu
    autoLauncher.isEnabled().then(enabled => {
      const idx = menuTemplate.findIndex(item => item && item.label === 'Auto Start on Boot');
      if (idx !== -1) {
        menuTemplate[idx].checked = enabled;
        if (tray) tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
      }
    });
  }

  menuTemplate.push({ label: 'Refresh', click: () => updatePrice(true) });
  menuTemplate.push({ label: 'Quit', click: () => { isQuitting = true; app.quit(); } });

  return Menu.buildFromTemplate(menuTemplate);
}

function buildAndSetMenu(price, change) {
  let priceStr = '--', changeStr = '--';
  const symbol = (EXCHANGES[selectedExchange] && EXCHANGES[selectedExchange].symbol) ? EXCHANGES[selectedExchange].symbol : '';
  if (typeof price === 'number' && !isNaN(price)) {
    priceStr = symbol + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (typeof change === 'number' && !isNaN(change)) {
    changeStr = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
  }
  tray.setContextMenu(buildContextMenu(priceStr, changeStr));
}

async function updatePrice(force = false) {
  const now = Date.now();
  if (!force && now - lastFetchTime < FETCH_INTERVAL) {
    log('Rate limit: Skipping price fetch (too soon)');
    return;
  }
  lastFetchTime = now;
  try {
    const { price, change, currency, symbol, coin } = await EXCHANGES[selectedExchange].fetch();
    lastKnownPrice = price;
    lastKnownChange = change;
    buildAndSetMenu(price, change);
    if (mainWindow) {
      mainWindow.webContents.send('price-update', {
        price,
        change24h: change,
        currency,
        symbol,
        coin,
        error: false
      });
    }
    return { price, change, coin };
  } catch (error) {
    log(`Error updating price: ${error.message}\n${error.stack}`);
    if (tray && contextMenu && lastKnownPrice !== null) {
      buildAndSetMenu(lastKnownPrice, lastKnownChange);
    }
    if (mainWindow) {
      mainWindow.webContents.send('price-update', {
        price: lastKnownPrice,
        change24h: lastKnownChange,
        currency: EXCHANGES[selectedExchange].currency,
        symbol: EXCHANGES[selectedExchange].symbol,
        coin: selectedCoins[selectedExchange],
        error: true,
        errorMessage: 'Failed to update price'
      });
    }
    return { price: lastKnownPrice, change: lastKnownChange, error: true };
  }
}

function createWindow() {
  log('Creating main window...');
  try {
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    log(`Display info - Width: ${width}, Height: ${height}, Scale: ${primaryDisplay.scaleFactor}`);

    // Fallback for Windows: frameless, transparent window
    const isWin = process.platform === 'win32';
    const windowOptions = {
      width: 300,
      height: 200,
      x: width - 320, // Pin to right
      y: 20, // Pin to top
      frame: false,
      transparent: true, // Enable window transparency
      alwaysOnTop: false, // Not always on top
      show: false,
      skipTaskbar: true,
      resizable: false,
      movable: true, // Allow window to be dragged
      focusable: true, // Restore focusable to true to avoid taskbar icon issue
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        backgroundThrottling: false,
        webSecurity: false
      }
    };
    mainWindow = new BrowserWindow(windowOptions);
    // Force window to top right on start
    mainWindow.setPosition(width - 320, 20);
    
    // Load the index.html file with error handling
    log('Loading index.html');
    let indexPath;
    if (app.isPackaged) {
      indexPath = path.join(process.resourcesPath, 'app.asar', 'index.html');
      if (!fs.existsSync(indexPath)) {
        // Try fallback for some packagers
        indexPath = path.join(process.resourcesPath, 'index.html');
      }
    } else {
      indexPath = path.join(__dirname, 'index.html');
    }
    mainWindow.loadFile(indexPath).catch((err) => {
      log(`Error loading index.html: ${err.message}`);
      dialog.showErrorBox('Load Error', `Failed to load index.html: ${err.message}`);
      showErrorAndQuit('Load Error', err.message);
    });
    
    // Show window when ready
    mainWindow.once('ready-to-show', () => {
      log('Window is ready to show');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.showInactive();
        // On Windows, try to push window behind Explorer and avoid focus
        if (process.platform === 'win32') {
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.blur();
              mainWindow.setAlwaysOnTop(false, 'normal');
            }
          }, 200);
        }
        // Show Windows notification popup
        if (process.platform === 'win32' && Notification && Notification.isSupported()) {
          new Notification({
            title: 'Bitcoin Price Widget',
            body: 'Added to desktop',
            silent: false
          }).show();
        }
      }
    });
    
    // Handle window close
    mainWindow.on('close', (e) => {
      log('Window close event received');
      log('App is quitting - allowing window close');
      return true;
    });
    
    mainWindow.on('closed', () => {
      log('Window closed');
      mainWindow = null;
    });
    
    // Debug window events
    mainWindow.on('show', () => log('Window shown event'));
    mainWindow.on('hide', () => log('Window hidden event'));
    mainWindow.on('focus', () => log('Window focused'));
    mainWindow.on('blur', () => log('Window blurred'));
    
    log('Window creation completed');
    
  } catch (error) {
    log(`Error in createWindow: ${error.message}\n${error.stack}`);
    dialog.showErrorBox('Window Creation Error', `Failed to create window: ${error.message}`);
    showErrorAndQuit('Window Creation Error', error.message);
  }
}

// IPC handlers
ipcMain.on('refresh-price', async () => {
  try {
    await updatePrice();
  } catch (error) {
    console.error('Error refreshing price:', error);
  }
});

// --- New: Symbol input modal IPC handlers ---
ipcMain.on('symbol-input-value', async (event, symbol) => {
  symbol = (symbol || '').trim().toLowerCase();
  let found = null;

  // Canonical CoinGecko symbol-to-ID mapping for major coins
  const canonicalCoinGecko = {
    btc: 'bitcoin',
    eth: 'ethereum',
    sol: 'solana',
    bnb: 'binancecoin',
    ada: 'cardano',
    xrp: 'ripple',
    doge: 'dogecoin',
    ltc: 'litecoin',
    dot: 'polkadot',
    matic: 'matic-network',
    link: 'chainlink',
    shib: 'shiba-inu',
    usdt: 'tether',
    usdc: 'usd-coin',
    trx: 'tron',
    avax: 'avalanche-2',
    // Add more as needed
  };

  if (selectedExchange === 'coingecko') {
    let coinId = canonicalCoinGecko[symbol];
    if (coinId) {
      found = coinGeckoCoinList.find(c => c.id === coinId);
    } else {
      // fallback: first match by symbol
      found = coinGeckoCoinList.find(c => c.symbol.toLowerCase() === symbol);
    }
    if (found) {
      selectedCoins.coingecko = { id: found.id, symbol: found.symbol, name: found.name };
      store.set('selectedCoins', selectedCoins);
      await updatePrice(true);
      buildAndSetMenu(lastKnownPrice, lastKnownChange);
      if (global.symbolInputWindow) global.symbolInputWindow.close();
    } else {
      if (global.symbolInputWindow) {
        global.symbolInputWindow.webContents.send('symbol-input-error', `No coin with symbol "${symbol}" found on CoinGecko.`);
      }
    }
  } else {
    found = coinDCXCoinList.find(c => c.symbol.toLowerCase() === symbol);
    if (found) {
      selectedCoins.coindcx = { id: found.id, symbol: found.symbol, name: found.name };
      store.set('selectedCoins', selectedCoins);
      await updatePrice(true);
      buildAndSetMenu(lastKnownPrice, lastKnownChange);
      if (global.symbolInputWindow) global.symbolInputWindow.close();
    } else {
      if (global.symbolInputWindow) {
        global.symbolInputWindow.webContents.send('symbol-input-error', `No INR market with symbol "${symbol}" found on CoinDCX.`);
      }
    }
  }
});
ipcMain.on('symbol-input-cancel', () => {
  if (global.symbolInputWindow) global.symbolInputWindow.close();
});
// --- End new ---

// Log renderer errors
ipcMain.on('renderer-error', (event, errMsg) => {
  log(`Renderer process error: ${errMsg}`);
});

// App event handlers
app.whenReady().then(async () => {
  try {
    // Fetch coin lists at startup
    try {
      const resp = await axios.get('https://api.coingecko.com/api/v3/coins/list');
      coinGeckoCoinList = resp.data
        .filter(c => !!c.id && !!c.symbol && !!c.name)
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      log(`Failed to fetch CoinGecko coin list: ${err.message}`);
      coinGeckoCoinList = [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' }];
    }
    try {
      const resp = await axios.get('https://api.coindcx.com/exchange/ticker');
      const inrMarkets = resp.data.filter(t => t.market.endsWith('INR'));
      const seen = new Set();
      coinDCXCoinList = inrMarkets.map(t => {
        const base = t.market.replace('INR', '');
        return { id: t.market, symbol: base.toLowerCase(), name: base.toUpperCase() };
      }).filter(c => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      }).sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      log(`Failed to fetch CoinDCX market list: ${err.message}`);
      coinDCXCoinList = [{ id: 'BTCINR', symbol: 'btc', name: 'Bitcoin' }];
    }

    if (process.platform === 'win32') {
      app.setAppUserModelId('com.btcprice.widget');
    }

    createTray();
    createWindow();
    try {
      await updatePrice();
    } catch (error) {
      log(`Error in initial price update: ${error.message}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('price-update', {
          error: true,
          message: 'Failed to fetch initial price'
        });
      }
    }
    setInterval(() => {
      updatePrice().catch(err => {
        log(`Scheduled price update failed: ${err.message}`);
      });
    }, FETCH_INTERVAL);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else {
        const windows = BrowserWindow.getAllWindows();
        windows.forEach(win => {
          if (win.isMinimized()) win.restore();
          win.show();
        });
      }
    });
  } catch (error) {
    log(`Fatal error during app initialization: ${error.message}`);
    dialog.showErrorBox('Fatal Error', 'Failed to initialize application. Please check the logs.');
    app.quit();
  }
});

// Handle app quit
app.on('before-quit', (event) => {
  isQuitting = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeAllListeners();
    mainWindow.destroy();
  }
});

// Handle uncaught exceptions in the main process
process.on('uncaughtException', (error) => {
  const errorMsg = `Uncaught Exception: ${error.message}\n${error.stack}`;
  log(errorMsg);
  dialog.showErrorBox('Application Error', errorMsg);
});

// Ensure autoLauncher is always defined for current user only
let autoLauncher = null;
if (process.platform === 'win32') {
  const AutoLaunch = require('auto-launch');
  autoLauncher = new AutoLaunch({
    name: 'Bitcoin Price Widget',
    path: process.execPath,
    isHidden: false // show app window on startup
  });
}


