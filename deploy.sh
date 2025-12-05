#!/bin/bash

cd /var/www/autody/autody.online || exit 1

echo "🚀 Deploy script started"

# Pull latest code from GitHub
git pull origin main

# Install production deps
npm install --production

# Restart the live app
pm2 restart autody.online

echo "✅ Deploy finished"

