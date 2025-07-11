# Bitcoin Price Widget

A minimal Bitcoin price tracker that runs in the system tray on Windows 11.

## Features

- Shows current BTC/USD price in the system tray
- Displays 24h price change with emoji indicator (📈/📉)
- Updates every 60 seconds
- Lightweight and runs in the background
- No taskbar icon, only system tray

## Installation

1. Install Node.js from https://nodejs.org/
2. Clone this repository
3. Install dependencies:
   ```
   npm install
   ```
4. Create an `assets` folder and add a `icon.png` file for the tray icon (recommended size: 16x16 or 32x32 pixels)

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
- Click "Refresh" to manually update the price
- Click "Quit" to exit the application

## Notes

- The app uses the CoinGecko API to fetch price data
- Internet connection is required for price updates
