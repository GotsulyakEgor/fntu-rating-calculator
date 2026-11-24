#!/usr/bin/env bash
# Підставляє адресу вашого сайту у canonical, Open Graph, sitemap, robots та розмітку.
# Використання: ./set-domain.sh https://your-site.com/   (адреса з кінцевим слешем)
set -e
URL="${1:?Вкажіть адресу, наприклад https://your-site.com/}"
case "$URL" in */) ;; *) URL="$URL/" ;; esac
cd "$(dirname "$0")"
sed -i "s#https://example.com/#$URL#g" index.html robots.txt sitemap.xml
echo "Готово: $URL"
