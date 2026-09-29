# SAM_Toons

Студия рисованных кодом мультфильмов. Стиль — тонкая чёрная линия на белом с красным акцентом, человечки-«фасолины»
с большой круглой головой и глазами-точками. Анимация как у рисованных мультов: рисунок меняется через кадр (12,5 в секунду),
между движениями — неподвижные паузы, камера едет плавно.
Всё работает локально и бесплатно: рисует движок на JavaScript в безголовом браузере, озвучивают офлайн-TTS,
монтирует ffmpeg. Агенты на локальных моделях (Ollama) пишут сценарий и раскадровку — см. [docs/PLAN.md](docs/PLAN.md).

## Установка (Windows 10/11)

1. Python 3.11+ с [python.org](https://www.python.org/downloads/) (галочка «Add to PATH»).
2. В папке `SAM_Toons`:
   ```bat
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   playwright install chromium
   python studio\setup_voices.py
   ```
   `setup_voices.py` скачивает русские голоса Piper (~250 МБ) в `models/piper/`.
   ffmpeg ставится сам вместе с пакетом `imageio-ffmpeg`.
3. Лучшая озвучка — **Fun-CosyVoice3-0.5B**: клон голоса по образцу и эмоции. Ставится отдельно, инструкция — [docs/COSYVOICE.md](docs/COSYVOICE.md).
   Пока она не установлена, озвучивает Piper.

На Linux то же самое; дополнительно можно поставить `rhvoice rhvoice-russian espeak-ng`, и тогда они будут запасными голосами.

## Команды

```bash
python studio/sam.py make ufo_casino          # всё сразу: проверка → озвучка → раскадровка → MP4
python studio/sam.py check  ufo_casino        # проверить film.json
python studio/sam.py voice  ufo_casino        # озвучить реплики
python studio/sam.py stills ufo_casino        # раскадровка → films/ufo_casino/build/storyboard.html
python studio/sam.py render ufo_casino --half # быстрый черновик 960×540
python studio/sam.py render ufo_casino        # 1920×1080 → films/ufo_casino/build/film.mp4
python studio/sam.py serve                    # живой плеер: http://127.0.0.1:8000/engine/player.html?film=ufo_casino
python studio/sam.py voices                   # какие голоса нашлись на этом ПК
python studio/sam.py ref narrator запись.wav --text "что сказано"   # образец голоса для CosyVoice
python studio/sam.py vocab                    # позы, эмоции, предметы, звуки
```

## Как устроено

```
engine/            движок (JS, работает и в плеере, и при рендере)
  pen.js           перо: дрожащая «кипящая» линия, фигуры, текст
  character.js     человечки: скелет, 22 позы, лица и настроения, причёски, значки эмоций
  props.js         декорации: облако, дерево, куст, дом, здание-казино, НЛО с лучом, таблички
  timeline.js      биты → дорожки времени (длительность из озвучки)
  stage.js         кадр целиком: камера, земля, слои, субтитры, переходы
  player.html      плеер со звуком + API для рендера
studio/            Python-студия
  sam.py           командная строка
  check.py         валидатор film.json (словарь берёт из движка)
  voice.py         озвучка: CosyVoice3 / Piper / RHVoice / eSpeak → wav + «громкость рта» по кадрам
  cosy_worker.py   запуск CosyVoice3 в её собственном окружении (пакетом, модель грузится один раз)
  voices.json      пресеты голосов
  audio.py         процедурные звуки и сведение
  storyboard.py    кадры раскадровки + листы HTML/PNG
  render.py        кадры из браузера → ffmpeg → MP4
voices/            образцы голосов для клонирования (<пресет>.wav + .txt)
films/<фильм>/     film.json + build/ (озвучка, раскадровка, видео — не в git)
docs/              FILM_FORMAT.md — формат фильма для агентов, PLAN.md — план
```

Формат фильма: [docs/FILM_FORMAT.md](docs/FILM_FORMAT.md). Справочник поз: `python studio/sam.py stills _poses`.

Скорость на облачной машине с 4 ядрами: 41 секунда мультфильма рендерится в 1080p за ~45 с, в 540p — за ~20 с.
5-минутный фильм в 1080p — порядка 5–6 минут.
