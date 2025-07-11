# Crypto Price Widget

A minimal crypto price tracker that runs in the system tray on Windows 11.

## Features

- Shows current BTC/USD or BTC/INR price in the system tray(Will add more in future)
- Updates every 60 seconds
- Lightweight and runs in the background
- No taskbar icon, only system tray
- Exchange switcher: CoinGecko (USD) or CoinDCX (INR)

## Installation

1. Install Node.js from https://nodejs.org/
2. Clone this repository
3. Install dependencies:
   ```
   npm install
   ```

## Running the App

```
npm start
```

## Building for Windows

To create an executable:

```
npm run build
```

The executable will be created in the `dist` folder.

## Usage

- Left-click the tray icon to see the current price and menu
- Use the context menu to switch exchanges or enable/disable auto start
- Click "Refresh" to manually update the price
- Click "Quit" to exit the application

## Notes

- The app uses the CoinGecko and CoinDCX APIs to fetch price data
- Internet connection is required for price updates
- For auto start, the app adds itself to the current user's startup (no admin
  required). If you see a permission error, run the app from a user-writable
  location (not Program Files).
