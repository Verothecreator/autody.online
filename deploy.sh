#!/bin/bash

cd /var/www/autody/autody.online || exit 1

echo "🚀 Deploy script started"

git reset --hard
git pull origin main

npm install --production

pm2 restart autody.online

echo "✅ Deploy finished"
