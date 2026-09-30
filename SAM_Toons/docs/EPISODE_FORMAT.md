# Формат серии — `films/<серия>/episode.json`

Серия — это список **планов** (shots). Каждый план рендерится в Blender отдельно (стиль `mult`: чёрный контур на белом),
кэшируется и склеивается встык. Озвучка, звуки, шаги и фон собираются на одну дорожку. Это контракт для агентов:
сценарист пишет `script.md`, режиссёр переводит его в `episode.json`, критик смотрит `build/episode_sheet.jpg`.

```bash
python studio/sam.py episode swamp_ep1 --stills        # только ключевые кадры планов → build/episode_sheet.jpg (минуты)
python studio/sam.py episode swamp_ep1 --draft         # черновик 480×270 «через кадр» → build/episode_draft.mp4
python studio/sam.py episode swamp_ep1                 # чистовик 960×540 (size) → build/episode_final.mp4 + episode.srt
python studio/sam.py episode swamp_ep1 --shots s3a,s4  # перерисовать только эти планы
```

## Верх файла

| поле | что это |
|---|---|
| `fps`, `size`, `samples` | 25, `[960, 540]` (1080p — `[1920, 1080]`), сглаживание Eevee |
| `style` | `{"look": "mult", "line": 1.75, "wobble": 0.6}` — толщина и «дрожь» линии |
| `cast` | персонажи: `voice` (пресет из `studio/voices.json`), `pitch`, `tempo`, `rvc`; для актёров 3D — `hold: "camera"`, `hair`, `size`, `head` |
| `set` | декорации по умолчанию для всех планов: `trees [[x,y,h]]`, `bushes [[x,y,w]]`, `reeds [[x,y]]`, `pools [[x,y,w,d]]`, `glow [[x,y]]` |
| `ambience` | фон серии: `sounds/amb_<имя>/` или синтез (`swamp`) |
| `footsteps` | звук шагов по контактам стоп из мокапа (`squelch`); `false` — без шагов |
| `shots` | планы по порядку |

Координаты: X — вправо, Y — вглубь (от камеры), Z — вверх. Камера обычно стоит на −Y и смотрит на +Y.

## План

```json
{"id": "s2", "note": "что происходит (для раскадровки)",
 "lines": [{"who": "boris", "text": "…", "mood": "sly", "at": "L1e+1.1"}],
 "actors": {"boris": {"start": [x, y], "segments": [{"move": "lean_down", "face": 70, "until": "L2"}],
                      "morph": [{"t": 3, "swell": 1}], "sink": [{"t": 1, "z": 0}, {"t": 2, "z": -0.16}]}},
 "creatures": [ … ],
 "sfx": [{"at": "L1e+0.3", "name": "sniff", "vol": 1.0}],
 "camera": [{"t": 0, "pos": [x, y, z], "look": [x, y, z]}, {"t": "end", …}], "lens": 30,
 "shake": [{"t": 0.4, "dur": 3, "amp": 0.035}],
 "overlay": "rec",             // рамка камеры блогера: REC, таймкод, батарейка
 "ambience": true, "footsteps": "squelch", "duration": 6.0}
```

**Время.** Везде, где есть время (`at`, `t`, `t0`, `t1`, `until`, `turn_at`, `land`, `leave`, `nod`, ключи `fly`/`turn`, `last_stop`),
можно писать число секунд от начала плана или выражение относительно реплик плана:
`"L2"` — начало 2-й реплики, `"L2e"` — её конец, `"L2e+0.3"`, `"end"`, `"end-1"`.
Длительность плана считается сама: конец последней реплики + 0,7 с, последний ключ камеры, конец движений. `duration` задаёт её жёстко.
Реплики без `at` идут одна за другой с паузой 0,25 с.

**Актёры** (3D-фасолины с мокапом). `segments` склеиваются по порядку: `move` — имя из `blender/moves.json`,
`dur` или `until` (до какого момента), `face` (0 — к камере, 90 — вправо, −90 — влево), `blend` (сек. перехода), `speed`.
Если `dur` длиннее записи, последняя поза держится. Ходьба (`walk`, `walk_brisk`) сама перемещает актёра.
Движения: idle, walk, walk_brisk, look_around, search_ground, lean_down, scared, vlog, talk, explain_big, celebrate, sad, swat, look_arm.
`morph` — превращение правой руки: `swell` 0..1 (раздувается), `claw` 0..1 (клешня выскакивает с «хлопком»).
`sink` — ключи высоты (провалиться в трясину). Губы двигаются по озвучке сами, глаза моргают сами.

**Существа.**
- `{"type": "capykanga", "hops": {"from": x0, "to": x1, "y": y, "t0", "t1", "turn_at"}}` — капибара-кенгуру; `turn_at` — поворот к камере богомольей половиной морды.
- `{"type": "mantis_trunk", "run": {"from", "to", "y", "t0", "t1"}, "scale"}` — богомол с хоботом.
- `{"type": "mantis_deer", "n": 7, "spread": 1.5, "run": {…}, "last_stop": [x, t_stop, t_go], "nod": t}` — стадо с рогами; последний останавливается и кивает.
- `{"type": "mantis_baby", "fly": [[t, [x,y,z]], …], "land": t, "leave": t, "target": ["boris", "RightHand"]}` — малыш, садится на кость актёра.
- `{"type": "flower", "x", "y", "h", "turn": [[t, градусы], …]}` — светящийся цветок, поворачивает «голову» (0 — в камеру, −90 — влево).

**Титр** — план с `"card": {"lines": ["ТРИ ЧАСА", "НАЗАД"]}` и `duration`.

**Звуки** (`sfx.name`): сначала запись из `sounds/<имя>/` (скачать: `python studio/get_sounds.py`), иначе синтез из `studio/audio.py`:
squelch, sink, splash, click, trumpet, whoosh, whoosh_by, stampede, buzz, sting, inflate, crunch, sniff, pop, pop_big, thud, boing,
ding, fail, music_sting. Фон под речью автоматически приглушается.

## Кэш
План перерисовывается, только если изменились его спецификация (после расстановки времени) или код в `blender/`.
Кадры и видео планов — `build/shots/<id>_<draft|final>/`, ключевые кадры — `build/shot_stills/<id>/`.
