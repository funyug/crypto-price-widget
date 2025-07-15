# Crypto Price Widget

A minimal crypto price tracker that runs in the system tray on Windows 11.

## Features

- Shows the current price and 24h change for any coin (BTC, ETH, SOL, etc.) from CoinGecko (USD) or CoinDCX (INR)
- Enter any coin symbol (e.g., btc, eth, sol) via a modal textbox in the tray menu
- Canonical coin selection for major coins (e.g., "btc" always means Bitcoin)
- Updates every 60 seconds
- Lightweight and runs in the background
- No taskbar icon, only system tray
- Exchange switcher: CoinGecko (USD) or CoinDCX (INR)
- Auto start on boot (Windows)
- Manual refresh and quit options

## Download

[Download latest Windows build](https://github.com/funyug/crypto-price-widget/releases/latest)

## Manual Installation

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
- Use the context menu to:
  - Switch exchanges (CoinGecko or CoinDCX)
  - Set coin symbol (opens a textbox modal; enter e.g. "btc", "eth", "sol")
  - Enable/disable auto start (Windows)
  - Refresh price manually
  - Quit the application

## Notes

- The app uses the CoinGecko and CoinDCX APIs to fetch price data
- Internet connection is required for price updates
- For auto start, the app adds itself to the current user's startup (no admin required). If you see a permission error, run the app from a user-writable location (not Program Files).
- For major coins, the app always selects the official/canonical coin (e.g., "btc" → Bitcoin, "eth" → Ethereum, etc.) even if there are multiple tokens with the same symbol on CoinGecko.
