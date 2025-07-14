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
  
  // Log to console
  console.log(logMessage.trim());
  
  // Log to file
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
let selectedExchange = store.get('exchange');
if (!selectedExchange || !EXCHANGES[selectedExchange]) {
  selectedExchange = 'coingecko';
  store.set('exchange', 'coingecko');
}

function createTray() {
  log('Creating tray icon...');
  if (isWSL) {
    log('Skipping tray icon creation in WSL');
    return;
  }
  try {
    let trayIconPath;
    let trayIcon;
    if (process.platform === 'win32') {
      // Use resourcesPath for production builds
      trayIconPath = path.join(process.resourcesPath, 'assets', 'icon.ico');
      if (!fs.existsSync(trayIconPath)) {
        log(`Tray icon file does not exist (ICO): ${trayIconPath}`);
      }
      trayIcon = nativeImage.createFromPath(trayIconPath);
      log(`Tried loading tray icon (ICO): ${trayIconPath}, isEmpty: ${trayIcon.isEmpty()}`);
      if (trayIcon.isEmpty()) {
        trayIconPath = path.join(process.resourcesPath, 'assets', 'icon.png');
        if (!fs.existsSync(trayIconPath)) {
          log(`Tray icon file does not exist (PNG): ${trayIconPath}`);
        }
        trayIcon = nativeImage.createFromPath(trayIconPath);
        log(`Fallback to tray icon (PNG): ${trayIconPath}, isEmpty: ${trayIcon.isEmpty()}`);
      }
    } else {
      trayIconPath = path.join(__dirname, 'assets', 'icon.png');
      if (!fs.existsSync(trayIconPath)) {
        log(`Tray icon file does not exist: ${trayIconPath}`);
      }
      trayIcon = nativeImage.createFromPath(trayIconPath);
      log(`Tried loading tray icon (PNG): ${trayIconPath}, isEmpty: ${trayIcon.isEmpty()}`);
    }
    if (trayIcon.isEmpty()) {
      log('Tray icon failed to load. Please check assets/icon.png or assets/icon.ico');
      return;
    }
    tray = new Tray(trayIcon);
    buildAndSetMenu(lastKnownPrice, lastKnownChange);
    tray.setToolTip('Bitcoin Price Widget');
    
    // Toggle window visibility on tray icon click
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
    log(`Error creating tray: ${err.message}\n${err.stack}`);
    showErrorAndQuit('Tray Error', `Failed to create tray icon: ${err.message}`);
  }
}

let lastFetchTime = 0;
const FETCH_INTERVAL = 60000; // 60 seconds
let lastKnownPrice = null;
let lastKnownChange = null;

function buildContextMenu(priceStr, changeStr) {
  const menuTemplate = [
    { label: `BTC/${EXCHANGES[selectedExchange].currency}: ${priceStr} (${changeStr})`, id: 'price', enabled: false },
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
    }
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
    const { price, change, currency, symbol } = await EXCHANGES[selectedExchange].fetch();
    lastKnownPrice = price;
    lastKnownChange = change;
    buildAndSetMenu(price, change);
    if (mainWindow) {
      mainWindow.webContents.send('price-update', {
        price,
        change24h: change,
        currency,
        symbol,
        error: false
      });
    }
    return { price, change };
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
      focusable: true, // Prevent focus at creation
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

// Log renderer errors
ipcMain.on('renderer-error', (event, errMsg) => {
  log(`Renderer process error: ${errMsg}`);
});

// App event handlers
app.whenReady().then(async () => {
  log('App is ready');
  try {
    // Set the app user model ID for Windows
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.btcprice.widget');
      log('Set Windows AppUserModelID');
    }

    // Create tray first
    log('Creating system tray...');
    createTray();
    
    // Then create window
    log('Creating main window...');
    createWindow();
    
    // Initial price update
    try {
      log('Performing initial price update...');
      await updatePrice();
      log('Initial price update completed');
    } catch (error) {
      log(`Error in initial price update: ${error.message}\n${error.stack}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('price-update', { 
          error: true,
          message: 'Failed to fetch initial price'
        });
      }
    }
    
    // Update price every 60 seconds
    log('Setting up price update interval (60s)');
    setInterval(() => {
      log('Performing scheduled price update...');
      updatePrice().catch(err => {
        log(`Scheduled price update failed: ${err.message}`);
      });
    }, FETCH_INTERVAL);
    
    // Handle app activation (macOS)
    app.on('activate', () => {
      log('App activated');
      if (BrowserWindow.getAllWindows().length === 0) {
        log('No windows found, creating new window');
        createWindow();
      } else {
        log('Bringing existing window to front');
        const windows = BrowserWindow.getAllWindows();
        windows.forEach(win => {
          if (win.isMinimized()) win.restore();
          win.show();
        });
      }
    });
    
    log('App initialization completed');
    
  } catch (error) {
    log(`Fatal error during app initialization: ${error.message}\n${error.stack}`);
    dialog.showErrorBox('Fatal Error', 'Failed to initialize application. Please check the logs.');
    app.quit();
  }
});

// Handle app quit
app.on('before-quit', (event) => {
  log('before-quit event received');
  isQuitting = true;
  
  // Clean up resources
  if (mainWindow && !mainWindow.isDestroyed()) {
    log('Cleaning up main window');
    mainWindow.removeAllListeners();
    mainWindow.destroy();
  }
  
  log('App is quitting...');
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

// Remove or comment out verbose logs for production
// log(`Application starting in ${process.platform === 'linux' && process.env.WSL_DISTRO_NAME ? 'WSL' : 'native'} environment`);
// log(`Platform: ${process.platform}, Arch: ${process.arch}`);
// log(`App path: ${app.getAppPath()}`);
// log(`User data path: ${app.getPath('userData')}`);
// log(`Command line arguments: ${process.argv.join(' ')}`);
// log(`App version: ${app.getVersion()}`);
// log(`Electron version: ${process.versions.electron}`);
// log(`Chrome version: ${process.versions.chrome}`);
// log(`Node.js version: ${process.versions.node}`);
