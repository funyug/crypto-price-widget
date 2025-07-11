#!/bin/bash

# Install required build tools
sudo apt-get update
sudo apt-get install -y nodejs npm

# Install dependencies
npm install

# Install electron-builder globally if not already installed
if ! command -v electron-builder &> /dev/null; then
    sudo npm install -g electron-builder
fi

# Build the application
electron-builder --linux --x64

echo "Build complete! You can find the .AppImage file in the dist/ directory"
