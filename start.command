#!/bin/sh
# Двойной клик в Finder: поднимает локальный сервер и открывает браузер.
cd "$(dirname "$0")" || exit 1
exec python3 serve.py
