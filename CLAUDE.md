# Шарик — проект для Claude Code

2D-игра на **Unity 6**. Пластилиновым шариком управляет нейросеть: он думает вслух, смешно расплющивается и в финале выключает мир рубильником. Игрок мешает ему ловушками и боссами. Стиль — «мистическая гравюра»: кремовая бумага, чёрная тушь, коралл.

## Карта
- `Assets/_Project/Scripts/` — весь код игры (namespace `Sharik`). Сцена не нужна: `Core/Bootstrap.cs` собирает игру при Play.
  - `Core/` — GameManager, Tuning (все числа), камера, ввод, спрайты, события
  - `Ball/` — физика и внешний вид шарика, Navigator (инстинкт)
  - `Brain/` — мозг: нейросеть (OpenAI-совместимый API, Ollama), промпт, фразы, голос
  - `Traps/` — ловушки и боссы (управляет игрок)
  - `Level/` — загрузка уровня из JSON, объекты уровня
  - `UI/` — облачка мыслей и HUD на IMGUI
- `Assets/_Project/Resources/Levels/*.json` — уровни (ASCII-сетка + сценарий). Формат: `Design/LEVEL_FORMAT.md`
- `Assets/_Project/Resources/Brain/` — характер шарика (`persona_ru.txt`), офлайн-фразы, настройки нейросети
- `Assets/_Project/Resources/Sprites/` — PNG, генерируются `Tools/art/generate_sprites.py`
- `Design/` — GDD, формат уровней, брифы, превью
- `Tools/` — валидатор, превью, генератор спрайтов, проверка компиляции

## Команды
```bash
python3 Tools/levels/validate.py            # проходимость и схема всех уровней
python3 Tools/levels/render.py --path       # превью → Design/previews/*.png
python3 Tools/art/generate_sprites.py       # перерисовать все спрайты
Tools/compile_check/check.sh                # C# компилируется без Unity
```

## Мультиагентная работа над уровнями
- Навык `/new-level` — конвейер: `story-writer` → `level-architect` → `trap-designer` → `playtester` (агенты лежат в `.claude/agents/`).
- Навык `/playtest` — полная проверка без Unity.

## Правила
- Физика в `Core/Tuning.cs` и `Tools/levels/levellib.py` должна совпадать: по ней валидатор проверяет проходимость.
- Новые спрайты добавляются в генератор, а не рисуются руками в обход него (исключение — ручная доводка в Aseprite с тем же именем файла).
- API Unity 6: `Rigidbody2D.linearVelocity` — только через `Compat.Vel()/SetVel()`; поиск объектов — `FindFirstObjectByType`.
- Ввод только через `InputShim` (работает и с Input System, и со старым Input Manager).
- Перед коммитом кода запускай `Tools/compile_check/check.sh`, перед коммитом уровней — `validate.py`.
- Тексты игры на русском. Реплики до 140 символов.
