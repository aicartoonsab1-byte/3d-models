#!/usr/bin/env bash
# Проверка, что C#-код игры компилируется (без запуска Unity).
# Нужен .NET SDK 8 (sudo apt-get install dotnet-sdk-8.0). Справочные сборки UnityEngine скачиваются один раз с NuGet.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d .refs/lib ]; then
  echo "Скачиваю справочные сборки UnityEngine..."
  curl -sSL -o refs.nupkg https://api.nuget.org/v3-flatcontainer/unityengine.modules/2021.3.33/unityengine.modules.2021.3.33.nupkg
  mkdir -p .refs && (cd .refs && unzip -q -o ../refs.nupkg) && rm refs.nupkg
fi
status=0
for defs in ENABLE_INPUT_SYSTEM ENABLE_LEGACY_INPUT_MANAGER; do
  echo "== сборка с $defs"
  if ! dotnet build -nologo -v q -p:ExtraDefines=$defs 2>&1 | grep -E "error|warning CS|Build succeeded" | sort -u; then status=1; fi
  dotnet build -nologo -v q -p:ExtraDefines=$defs >/dev/null 2>&1 || status=1
done
[ $status -eq 0 ] && echo "✓ Код компилируется" || echo "✗ Есть ошибки компиляции"
exit $status
