# SAM_Toons — для Claude Code

Отдельный от «Шарика» проект: студия 5-минутных рисованных кодом мультфильмов (тонкая чёрная линия на белом + красный акцент; персонажи-«фасолины», анимация «на двойках» с неподвижными паузами).
Всё локально: движок на JS в безголовом Chromium, офлайн-TTS, ffmpeg; агенты — на локальных моделях через Ollama (RTX 3070 8 ГБ).
План: `docs/PLAN.md`. Формат фильма (контракт для агентов): `docs/FILM_FORMAT.md`.

## Правила
- Агенты и люди пишут только `films/<фильм>/film.json`; рисует движок. Не рисовать кадры «вручную» в обход движка.
- Новая поза / предмет / звук: добавить в `engine/character.js` (POSES, SAM.MOODS…), `engine/props.js` (`def(...)`) или `studio/audio.py` (`sfx_*`) и обновить словарь в `docs/FILM_FORMAT.md`. Валидатор берёт словарь из кода сам.
- Внутри движка ось Y вниз (земля y=0); в film.json `y` — высота над землёй (вверх).
- Перед коммитом: `python studio/sam.py check <фильм>` и `python studio/sam.py stills <фильм>`, посмотреть `build/storyboard.png`.
- Озвучка: CosyVoice3 (главный движок, своё окружение, `docs/COSYVOICE.md`) → Piper → RHVoice → eSpeak. Движки подключаются в `studio/voice.py`, пресеты — `studio/voices.json`.
- В облачной сессии Chromium берётся из /opt/pw-browsers сам. HuggingFace и ModelScope недоступны, но GitHub открыт: `python studio/setup_voices.py` берёт голоса Piper из релизов sherpa-onnx; там же есть русская модель распознавания речи (sherpa-onnx-small-zipformer-ru) — ею удобно проверять разборчивость озвучки, раз слушать нельзя. CosyVoice здесь только в режиме `"mock": true`.
- «Живость» TTS — `studio/lively.py` (Praat/parselmouth): темп, высота, размах интонации; настройки в `style.voice`/`style.narrator`.
- Тексты на русском, реплики до 140 символов.
