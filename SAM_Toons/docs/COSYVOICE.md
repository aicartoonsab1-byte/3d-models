# Озвучка через Fun-CosyVoice3-0.5B

[Fun-CosyVoice3-0.5B-2512](https://huggingface.co/FunAudioLLM/Fun-CosyVoice3-0.5B-2512) — нейросетевой синтез речи от FunAudioLLM.
Лицензия Apache-2.0, есть русский. Главное для студии: **клонирует голос по образцу 5–15 секунд** и умеет
говорить с эмоцией по инструкции. Работает локально на RTX 3070.

В студии это движок `cosyvoice`: он стоит первым в каждом пресете голоса (`studio/voices.json`).
Если модель не установлена или для голоса нет образца, берётся следующий движок (Piper → RHVoice → eSpeak),
так что можно переходить на CosyVoice постепенно, голос за голосом.

## Установка (Windows, один раз)

У CosyVoice свои версии torch и библиотек, поэтому ставим её в **отдельное окружение**, не в `.venv` студии.

1. Поставить [Miniconda](https://docs.conda.io/en/latest/miniconda.html) и [Git](https://git-scm.com/).
2. В «Anaconda Prompt», из папки `SAM_Toons`:
   ```bat
   git clone --recursive https://github.com/FunAudioLLM/CosyVoice.git models\CosyVoice
   conda create -n cosyvoice -y python=3.10
   conda activate cosyvoice
   cd models\CosyVoice
   pip install -r requirements.txt
   pip install huggingface_hub
   cd ..\..
   where python
   ```
   `where python` покажет путь вида `C:\Users\<вы>\miniconda3\envs\cosyvoice\python.exe`.
3. Уже в окружении студии (`.venv`):
   ```bat
   python studio\setup_cosyvoice.py --python C:\Users\<вы>\miniconda3\envs\cosyvoice\python.exe --download
   ```
   Скрипт скачает модель (несколько ГБ), пробно загрузит её и запишет пути в `studio/engines.local.json`.

Если `pip install -r requirements.txt` споткнётся на каком-то пакете под Windows, пришлите ошибку — поправим.

## Голоса: образцы

Для каждого пресета нужен образец `voices/<пресет>.wav`. Лучше всего 5–15 секунд чистой речи без музыки и эха
плюс текст того, что в нём сказано (тогда тембр копируется точнее):

```bat
python studio\sam.py ref narrator рассказчик.mp3 --text "Точный текст, который звучит в записи."
python studio\sam.py ref man_young гена.wav --text "..."
python studio\sam.py ref alien пришелец.wav
python studio\sam.py voices
```

`ref` сам переводит файл в моно 24 кГц, срезает тишину и обрезает до 15 секунд. Без `--text` включается режим
cross-lingual: он работает, но похожесть чуть хуже.

Свой голос персонажу: в `cast` укажите `"voice": "<имя>"` и добавьте пресет с таким именем в `studio/voices.json`
(или просто положите образец под именем существующего пресета).

## Эмоции и темп

`mood` реплики превращается в инструкцию модели. Это фразы из того набора, на котором CosyVoice3 обучалась:

| mood | как говорит |
|---|---|
| happy | очень радостно |
| sad | очень грустно |
| angry | очень зло |
| pray, tired | очень тихо |

Остальные настроения (scared, surprised, sly…) озвучиваются обычным клоном, но со своим темпом.
Темп CosyVoice меняет сам, без «бурундучного» искажения. Эффекты пресетов (`fx`: alien, robot, reverb) накладываются поверх.

## Советы

- Числа пишите словами («двадцать пять», а не «25»): нормализатор текста у модели настроен на китайский и английский.
- Первая озвучка медленнее: модель загружается 10–30 с. Все реплики фильма идут одним пакетом, поэтому загрузка одна.
- Готовые реплики кэшируются: при повторном `voice` озвучиваются только изменённые. `--force` — переозвучить всё.
- Проверка связки без модели: в `studio/engines.local.json` поставить `"mock": true`, и воркер будет писать тон вместо речи.
