#!/usr/bin/env bash
# Готовит окружение для работы агентов над «Шариком»: Pillow для спрайтов и превью,
# .NET SDK для проверки компиляции C#. Ставит только недостающее.
set -u
if ! python3 -c "import PIL" 2>/dev/null; then
  pip install --quiet pillow >/dev/null 2>&1 || pip install --quiet --break-system-packages pillow >/dev/null 2>&1 || true
fi
if ! command -v dotnet >/dev/null 2>&1 && [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] && command -v apt-get >/dev/null 2>&1; then
  # в облачной сессии ставим в фоне, чтобы не задерживать старт
  (DEBIAN_FRONTEND=noninteractive apt-get install -y -qq dotnet-sdk-8.0 >/tmp/dotnet-install.log 2>&1 &) || true
fi
exit 0
