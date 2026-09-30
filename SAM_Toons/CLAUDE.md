# SAM_Toons — для Claude Code

Отдельный от «Шарика» проект: студия 5-минутных рисованных кодом мультфильмов (тонкая чёрная линия на белом, без цвета — как в референсе; персонажи-«фасолины», анимация «на двойках» с неподвижными паузами).
Всё локально: движок на JS в безголовом Chromium, офлайн-TTS, ffmpeg; агенты — на локальных моделях через Ollama (RTX 3070 8 ГБ).
План: `docs/PLAN.md`. Формат фильма (контракт для агентов): `docs/FILM_FORMAT.md`.

## Правила
- Агенты и люди пишут только `films/<фильм>/film.json`; рисует движок. Не рисовать кадры «вручную» в обход движка.
- Новая поза / предмет / звук: добавить в `engine/character.js` (POSES, SAM.MOODS…), `engine/props.js` (`def(...)`) или `studio/audio.py` (`sfx_*`) и обновить словарь в `docs/FILM_FORMAT.md`. Валидатор берёт словарь из кода сам.
- Внутри движка ось Y вниз (земля y=0); в film.json `y` — высота над землёй (вверх).
- Перед коммитом: `python studio/sam.py check <фильм>` и `python studio/sam.py stills <фильм>`, посмотреть `build/storyboard.png`.
- Озвучка: CosyVoice3 (главный движок, своё окружение, `docs/COSYVOICE.md`) → Piper → RHVoice → eSpeak. Движки подключаются в `studio/voice.py`, пресеты — `studio/voices.json`.
- В облачной сессии Chromium берётся из /opt/pw-browsers сам. HuggingFace и ModelScope недоступны, но GitHub открыт: `python studio/setup_voices.py` берёт голоса Piper из релизов sherpa-onnx; там же есть русская модель распознавания речи (sherpa-onnx-small-zipformer-ru) — ею удобно проверять разборчивость озвучки, раз слушать нельзя. CosyVoice здесь только в режиме `"mock": true`.
- Главный рендер — Blender (`blender/`, `docs/BLENDER.md`, `python studio/sam.py shot <сцена>`): движения из мокапа CMU, стили `mult` (строго чёрный контур на белом, «фасолины», как референс) и `dusk`. 2D-движок (`engine/`) — для быстрых раскадровок.
- Замена голоса — Applio/RVC (`docs/APPLIO.md`, `studio/voice.py: rvc_batch`), `cast.<id>.rvc`. Стиль «dusk» (сумеречная иллюстрация, человек, болотные существа) — `engine/dusk.js`.
- «Живость» TTS — `studio/lively.py` (Praat/parselmouth): темп, высота, размах интонации; настройки в `style.voice`/`style.narrator`.
- Серия целиком — `films/<серия>/episode.json` (`docs/EPISODE_FORMAT.md`): планы Blender, время относительно реплик («L2e+0.3»),
  кэш планов, шаги по контактам стоп, фон и сведение (`studio/episode.py`, `audio.mix_timeline`). Проверка кадров без рендера всей
  серии: `python studio/sam.py episode <серия> --stills` → `build/episode_sheet.jpg`. Сценарий серии — `script.md` рядом.
- Звуки: сначала `sounds/<имя>/` (Freesound CC0, ключ только в переменной `FREESOUND_TOKEN`, никогда не коммитить), иначе синтез `sfx_*`.
- Gemini (облако, по желанию пользователя) — `docs/GEMINI.md`: озвучка Gemini TTS (движок `gemini` первым в пресетах, без ключа — Piper),
  видео Veo через шоураннера и оценщика (`studio/veo_studio.py`, `sam.py veo`). Ключ только в `GEMINI_API_KEY`; генерации Veo
  лимитированы — бюджет `daily_video_seconds`, расход в `build/gemini_usage.json`. Здесь ключа нет — проверять в mock-режиме.
- Тексты на русском, реплики до 140 символов.
