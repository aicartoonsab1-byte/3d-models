# Нейро-видео локально и бесплатно: ComfyUI + MiniMax H3

SAM_Toons рисует серию в Blender, а отдельные планы (существа, действие, превращения) может «переснять» нейросетью.
Бесплатный вариант — ComfyUI на вашем ПК с моделью MiniMax H3. Шоураннер и оценщик — локальные модели Ollama.
Конвейер тот же, что и для Veo: кадр из Blender как стартовый → генерация → оценка → пересъёмка → монтаж со своей озвучкой.

## Установка (Windows)
1. **ComfyUI** (портативная версия): https://github.com/comfyanonymous/ComfyUI → Releases → `ComfyUI_windows_portable`.
   Распаковать, например, в `C:\ComfyUI_windows_portable`, обновить: `update\update_comfyui.bat` (нужна версия 0.34.0 или новее).
2. **Узлы H3 Motion Context и проверка** — одной командой из папки SAM_Toons:
   ```bat
   python studio\setup_h3.py --comfy C:\ComfyUI_windows_portable
   ```
   Ставит пакет [ComfyUI-H3-Motion-Context](https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context), закреплённый на проверенной версии
   (код просмотрен: без сетевых запросов и запуска программ; удаляет только свои `clip_*.safetensors` в папке `output`).
   Он склеивает ролики H3 так, что движение и звук продолжаются через стык, а не начинаются заново.
3. **Модель H3** — вручную, по подсказке установщика. На RTX 3070 (8 ГБ) — только INT4/GGUF, запуск ComfyUI с `--lowvram`
   (в `run_nvidia_gpu.bat` добавить ключ). Будет медленно: это вариант для нескольких ключевых планов, а не для всей серии.
4. **Граф.** В ComfyUI откройте пример H3 «картинка → видео» (Workflow → Browse Templates → MiniMax H3 или пример из пакета),
   добейтесь, чтобы он работал на вашей карте (разрешение ~0.2–0.3 Мп, 4–6 с), затем **Workflow → Export (API)** →
   сохранить как `SAM_Toons\studio\comfy_workflows\h3_i2v.json`. SAM_Toons сам найдёт в графе промпт, кадр, длительность и seed
   (или поставьте в поля метки `{{prompt}}`, `{{image}}`, `{{seconds}}`, `{{seed}}`).
5. **Ollama** для шоураннера и оценщика: `ollama pull qwen3:8b` и `ollama pull qwen2.5vl:7b`.
   Пока ComfyUI генерирует, видеопамять занята им, поэтому Ollama на это время лучше закрыть или запускать оценку после генерации.

## Работа
```bat
REM ComfyUI должен быть запущен (run_nvidia_gpu.bat)
python studio\sam.py episode swamp_ep1 --stills     # кадры раскадровки (стартовые кадры для H3)
python studio\sam.py veo swamp_ep1 --plan           # шоураннер выбирает планы и пишет промпты → build\veo\plan.json
python studio\sam.py veo swamp_ep1                  # генерация + оценка + пересъёмка
python studio\sam.py episode swamp_ep1 --veo        # монтаж: принятые ролики вместо планов Blender
```
Настройки — `studio/videogen.json` (`backend`: `comfyui`/`veo`, `brain`: `ollama`/`gemini`, `max_takes`, `accept_score`);
свои — в `studio/videogen.local.json` (не в git).

Лицензии: пакет узлов — GPL-3.0; модель — MiniMax H3 Community License (не действует в США, ЕС, Великобритании, Южной Корее;
при выручке больше $20 млн нужно отдельное разрешение).
