#!/bin/bash

cd /var/www/autody/autody.online || exit
echo "🚀 Pulling latest code..."
git pull origin main
npm install --production
pm2 restart autody
