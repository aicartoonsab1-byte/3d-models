"""SAM_Toons · установка связки ComfyUI + MiniMax H3 для локальной генерации видео.

  python studio/setup_h3.py --comfy C:\\ComfyUI              # проверить ComfyUI, поставить узлы H3 Motion Context, проверить модели
  python studio/setup_h3.py --comfy C:\\ComfyUI --check      # только проверка

Что делает:
1. Проверяет, что версия ComfyUI не ниже 0.34.0: в ней появились узлы MiniMax H3.
2. Ставит пакет узлов H3 Motion Context (склейка клипов H3 так, что движение и звук продолжаются через стык)
   в ComfyUI/custom_nodes. Версия закреплена на проверенном коммите: код просмотрен — сетевых запросов и запуска
   программ нет, удаляет только свои файлы clip_*.safetensors внутри папки output. Лицензия пакета GPL-3.0.
   SAM_Toons его код не копирует, а только отправляет задания в ComfyUI.
3. Ищет файлы модели H3 и подсказывает, какую версию брать под вашу видеокарту.
Модели (десятки ГБ) не скачиваются автоматически — только вручную, по ссылкам ниже.
"""
from __future__ import annotations

import argparse
import io
import re
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

REPO = "https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context"
PINNED = "5335715abe54c1a9bfbe3494da29aae3e8635ce3"      # версия 0.6.2, проверена
NODE_DIR = "ComfyUI-H3-Motion-Context"
MIN_COMFY = (0, 34, 0)
MODEL_HINT = """Модель MiniMax H3 (кладётся в ComfyUI/models/…, пути — в инструкции ComfyUI к H3: docs.comfy.org → Tutorials → Video → MiniMax H3):
  • 8 ГБ видеопамяти (RTX 3070): только самые сжатые веса — INT4 (≈11 ГБ, часть уйдёт в оперативную память) или GGUF Q3/Q4.
    Запуск ComfyUI с ключом --lowvram. Ожидайте долгую генерацию (десятки минут на ролик) и ролики 4–6 с при ~0.2–0.3 Мп.
  • 16 ГБ: INT4 / смешанные INT4-INT8 — нормально. 24 ГБ+: INT8.
  Сжатые веса: https://huggingface.co/Abiray/Minimax-H3-nvfp4-INT4-INT8-Convrot
  Лицензия модели — MiniMax H3 Community License (не действует в США, ЕС, Великобритании и Южной Корее)."""


def comfy_version(root: Path) -> tuple | None:
    for f in (root / "comfyui_version.py", root / "ComfyUI" / "comfyui_version.py"):
        if f.exists():
            m = re.search(r'"(\d+)\.(\d+)\.(\d+)', f.read_text(encoding="utf-8"))
            if m:
                return tuple(int(x) for x in m.groups())
    return None


def comfy_root(p: Path) -> Path:
    """Путь к ComfyUI: и обычная установка, и портативная (ComfyUI_windows_portable/ComfyUI)."""
    for c in (p, p / "ComfyUI"):
        if (c / "custom_nodes").is_dir() and (c / "main.py").exists():
            return c
    raise SystemExit(f"Не нашёл ComfyUI в {p} (нужна папка с main.py и custom_nodes).")


def install_nodes(root: Path) -> Path:
    dst = root / "custom_nodes" / NODE_DIR
    if dst.exists():
        head = subprocess.run(["git", "-C", str(dst), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip() if shutil.which("git") else ""
        if head == PINNED or (dst / ".sam_pinned").exists() and (dst / ".sam_pinned").read_text().strip() == PINNED:
            print(f"✓ узлы H3 Motion Context уже стоят (проверенная версия) — {dst}"); return dst
        print(f"⚠ в {dst} другая версия пакета. Не трогаю: удалите папку сами, если хотите поставить проверенную.")
        return dst
    if shutil.which("git"):
        subprocess.run(["git", "clone", "--quiet", REPO, str(dst)], check=True)
        subprocess.run(["git", "-C", str(dst), "checkout", "--quiet", PINNED], check=True)
    else:                                                    # без git: архив нужного коммита
        data = urllib.request.urlopen(f"https://codeload.github.com/NikoDemon80/ComfyUI-H3-Motion-Context/zip/{PINNED}", timeout=120).read()
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            top = z.namelist()[0].split("/")[0]
            z.extractall(root / "custom_nodes")
        (root / "custom_nodes" / top).rename(dst)
    (dst / ".sam_pinned").write_text(PINNED)
    print(f"✓ узлы H3 Motion Context установлены → {dst} (перезапустите ComfyUI)")
    return dst


def find_models(root: Path) -> list[Path]:
    mdir = root / "models"
    return sorted(p for p in mdir.rglob("*") if p.is_file() and re.search(r"h3", p.name, re.I)
                  and p.suffix in (".safetensors", ".gguf")) if mdir.exists() else []


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--comfy", required=True, help="папка ComfyUI (или ComfyUI_windows_portable)")
    ap.add_argument("--check", action="store_true", help="только проверить, ничего не ставить")
    a = ap.parse_args()
    root = comfy_root(Path(a.comfy).expanduser())
    v = comfy_version(root)
    if v is None:
        print("⚠ не удалось узнать версию ComfyUI — обновите его (update/update_comfyui.bat) до 0.34.0 или новее")
    elif v < MIN_COMFY:
        print(f"✗ ComfyUI {'.'.join(map(str, v))} — для H3 нужен 0.34.0 или новее. Обновите: update/update_comfyui.bat")
        if not a.check:
            sys.exit(1)
    else:
        print(f"✓ ComfyUI {'.'.join(map(str, v))}")
    if not a.check:
        install_nodes(root)
    models = find_models(root)
    if models:
        print("✓ найдены файлы H3:\n  " + "\n  ".join(str(m.relative_to(root)) for m in models))
    else:
        print("✗ файлов модели H3 не найдено.")
    print(MODEL_HINT)
    wf = Path(__file__).resolve().parent / "comfy_workflows/h3_i2v.json"
    print(("✓ граф для SAM_Toons: " + str(wf)) if wf.exists() else
          f"Дальше: в ComfyUI откройте граф H3 «картинка → видео», добейтесь, чтобы он работал, затем Workflow → Export (API) → {wf}")


if __name__ == "__main__":
    main()
