using System.Collections.Generic;
using UnityEngine;

namespace Sharik
{
    /// <summary>Результат постройки уровня.</summary>
    public class LevelRuntime
    {
        public LevelData Data;
        public LevelGrid Grid;
        public Transform Root;
        public Vector2 Spawn;
        public Vector2 Goal;
        public readonly List<TrapBase> Traps = new List<TrapBase>();
        public readonly List<SpriteRenderer> WorldSprites = new List<SpriteRenderer>();
        public Color Sky;
    }

    /// <summary>
    /// Строит уровень из ASCII-сетки: тайлы, объединённые коллайдеры, ловушки, объекты и фон.
    /// Сцена и префабы не нужны — всё создаётся кодом, поэтому уровни можно писать текстом (и агентами).
    /// </summary>
    public static class LevelBuilder
    {
        static PhysicsMaterial2D _groundMat;

        public static readonly Dictionary<string, Color> SkyColors = new Dictionary<string, Color>
        {
            // «Мистическая гравюра»: бумага, тушь, коралл (см. Tools/art/generate_sprites.py)
            { "meadow", new Color32(0xef, 0xe3, 0xc8, 255) },
            { "cave", new Color32(0x23, 0x1c, 0x18, 255) },
            { "city", new Color32(0xf0, 0xa1, 0x93, 255) },
            { "glitch", new Color32(0xef, 0xe3, 0xc8, 255) },
            { "void", new Color32(0x0e, 0x0b, 0x0a, 255) },
        };

        public static LevelRuntime Build(LevelData d)
        {
            var rt = new LevelRuntime { Data = d, Grid = new LevelGrid(d) };
            var root = new GameObject($"Level {d.id}").transform;
            rt.Root = root;
            string pal = SkyColors.ContainsKey(d.palette ?? "") ? d.palette : "meadow";
            rt.Sky = SkyColors[pal];

            if (_groundMat == null) _groundMat = new PhysicsMaterial2D("Ground") { friction = 0.4f, bounciness = 0f };

            var tiles = new GameObject("Tiles").transform; tiles.SetParent(root, false);
            var objs = new GameObject("Objects").transform; objs.SetParent(root, false);
            var traps = new GameObject("Traps").transform; traps.SetParent(root, false);
            int fragIndex = 0;
            // фрагменты нумеруются слева-направо, сверху-вниз (как читает человек)
            var fragOrder = new List<Vector2Int>();

            for (int y = 0; y < d.Height; y++)
            for (int x = 0; x < d.Width; x++)
            {
                char c = d.At(x, y);
                var p = LevelGrid.Center(x, y);
                switch (c)
                {
                    case '#':
                        bool top = d.At(x, y + 1) != '#' && d.At(x, y + 1) != 'T';
                        rt.WorldSprites.Add(SpriteLib.Make("t", tiles, $"tile_{pal}_{(top ? "top" : "fill")}{Variant(x, y)}", p, Order.Tiles));
                        if (top && d.At(x, y + 1) == '.' && Deco(x, y, d))
                            rt.WorldSprites.Add(SpriteLib.Make("Deco", objs, $"deco_{(x * 7 + y) % 4}", LevelGrid.Center(x, y + 1), Order.Objects - 2));
                        break;
                    case '=':
                        rt.WorldSprites.Add(SpriteLib.Make("p", tiles, $"tile_{pal}_platform", p, Order.Tiles));
                        break;
                    case 'S':
                        rt.Spawn = new Vector2(p.x, y + Tuning.BallRadius + 0.02f);
                        break;
                    case 'F':
                    {
                        var sr = SpriteLib.Make("Exit", objs, "obj_exit", new Vector2(p.x, y + 1f), Order.Objects);
                        var col = sr.gameObject.AddComponent<BoxCollider2D>();
                        col.isTrigger = true; col.size = new Vector2(0.6f, 1.6f);
                        sr.gameObject.AddComponent<ExitDoor>();
                        rt.Goal = p;
                        rt.WorldSprites.Add(sr);
                        break;
                    }
                    case 'R':
                    {
                        var sr = SpriteLib.Make("Switch", objs, "obj_switch_off", new Vector2(p.x, y + 1f), Order.Objects);
                        var col = sr.gameObject.AddComponent<BoxCollider2D>();
                        col.isTrigger = true; col.size = new Vector2(1.4f, 1.8f);
                        var fs = sr.gameObject.AddComponent<FinalSwitch>(); fs.Sr = sr;
                        rt.Goal = p;
                        rt.WorldSprites.Add(sr);
                        break;
                    }
                    case 'K':
                    {
                        var sr = SpriteLib.Make("Checkpoint", objs, "obj_checkpoint_off", p, Order.Objects);
                        var col = sr.gameObject.AddComponent<BoxCollider2D>();
                        col.isTrigger = true; col.size = new Vector2(0.8f, 1f);
                        sr.gameObject.AddComponent<Checkpoint>();
                        rt.WorldSprites.Add(sr);
                        break;
                    }
                    case '*':
                        fragOrder.Add(new Vector2Int(x, y));
                        break;
                    case '^': rt.Traps.Add(SpikesTrap.Create(traps, x, y, rt)); break;
                    case 'C': rt.Traps.Add(CrusherTrap.Create(traps, x, y, rt)); break;
                    case 'T': rt.Traps.Add(TrapdoorTrap.Create(traps, x, y, rt)); break;
                    case 'W': rt.Traps.Add(FanTrap.Create(traps, x, y, rt)); break;
                    case 'J': rt.Traps.Add(SpringTrap.Create(traps, x, y, rt)); break;
                    case 'B': rt.Traps.Add(BossTrap.Create(traps, x, y, rt, d.boss)); break;
                }
            }

            fragOrder.Sort((a, b) => a.y != b.y ? b.y.CompareTo(a.y) : a.x.CompareTo(b.x));
            foreach (var f in fragOrder)
            {
                var sr = SpriteLib.Make("Fragment", objs, "obj_fragment", LevelGrid.Center(f.x, f.y), Order.Objects);
                var col = sr.gameObject.AddComponent<CircleCollider2D>();
                col.isTrigger = true; col.radius = 0.4f;
                var fr = sr.gameObject.AddComponent<Fragment>();
                fr.text = fragIndex < d.fragments.Length ? d.fragments[fragIndex] : "...";
                fragIndex++;
            }

            BuildColliders(d, root);
            BuildBackground(rt, pal);
            return rt;
        }

        /// <summary>Вариант тайла: изредка — с полумесяцем, глазом или ростком.</summary>
        static string Variant(int x, int y)
        {
            int h = (x * 73 + y * 31) % 11;
            return h == 0 ? "_b" : h == 5 ? "_c" : "";
        }

        /// <summary>Декоративные обитатели (грибы, зверьки, цветы-глаза, улитки) — редко и не рядом с игровыми объектами.</summary>
        static bool Deco(int x, int y, LevelData d)
        {
            if ((x * 37 + y * 11) % 9 != 0) return false;
            for (int dx = -2; dx <= 2; dx++)
            for (int dy = 0; dy <= 2; dy++)
            {
                char c = d.At(x + dx, y + dy);
                if (c != '.' && c != '#') return false;
            }
            return true;
        }

        /// <summary>Жадно объединяем твёрдые клетки в прямоугольники — меньше коллайдеров и шарик не цепляется за стыки.</summary>
        static void BuildColliders(LevelData d, Transform root)
        {
            var solids = new GameObject("Colliders");
            solids.transform.SetParent(root, false);
            var used = new bool[d.Width, d.Height];
            for (int y = d.Height - 1; y >= 0; y--)
            for (int x = 0; x < d.Width; x++)
            {
                if (used[x, y] || d.At(x, y) != '#') continue;
                int x2 = x;
                while (x2 + 1 < d.Width && d.At(x2 + 1, y) == '#' && !used[x2 + 1, y]) x2++;
                int y2 = y;   // расширяем вниз, пока вся полоса твёрдая
                while (y2 - 1 >= 0)
                {
                    bool ok = true;
                    for (int xx = x; xx <= x2; xx++)
                        if (d.At(xx, y2 - 1) != '#' || used[xx, y2 - 1]) { ok = false; break; }
                    if (!ok) break;
                    y2--;
                }
                for (int yy = y2; yy <= y; yy++)
                for (int xx = x; xx <= x2; xx++) used[xx, yy] = true;

                var bc = solids.AddComponent<BoxCollider2D>();
                bc.sharedMaterial = _groundMat;
                bc.offset = new Vector2((x + x2 + 1) / 2f, (y2 + y + 1) / 2f);
                bc.size = new Vector2(x2 - x + 1, y - y2 + 1);
            }

            // Тонкие платформы: односторонние
            for (int y = 0; y < d.Height; y++)
            for (int x = 0; x < d.Width; x++)
            {
                if (d.At(x, y) != '=' || (x > 0 && d.At(x - 1, y) == '=')) continue;
                int x2 = x;
                while (x2 + 1 < d.Width && d.At(x2 + 1, y) == '=') x2++;
                var go = new GameObject("Platform");
                go.transform.SetParent(root, false);
                var bc = go.AddComponent<BoxCollider2D>();
                bc.sharedMaterial = _groundMat;
                bc.offset = new Vector2((x + x2 + 1) / 2f, y + 1f - 2.5f / 16f);
                bc.size = new Vector2(x2 - x + 1, 5f / 16f);
                bc.usedByEffector = true;
                var eff = go.AddComponent<PlatformEffector2D>();
                eff.useOneWay = true;
                eff.surfaceArc = 160f;
            }

            // Невидимые стены по краям уровня
            for (int side = 0; side < 2; side++)
            {
                var bc = solids.AddComponent<BoxCollider2D>();
                bc.offset = new Vector2(side == 0 ? -0.5f : d.Width + 0.5f, d.Height);
                bc.size = new Vector2(1f, d.Height * 2f + 10f);
            }
        }

        static void BuildBackground(LevelRuntime rt, string pal)
        {
            var d = rt.Data;
            var bg = new GameObject("Background").transform;
            bg.SetParent(rt.Root, false);

            var hills = SpriteLib.Make("Hills", bg, $"bg_hills_{pal}", new Vector2(d.Width / 2f, 2.5f), Order.Hills);
            hills.drawMode = SpriteDrawMode.Tiled;
            hills.size = new Vector2(d.Width * 2f + 60f, 2f);
            hills.gameObject.AddComponent<Parallax>().factor = 0.5f;
            rt.WorldSprites.Add(hills);

            if (pal == "meadow" || pal == "city")
            {
                var rnd = new System.Random(d.id.GetHashCode());
                for (int i = 0; i < d.Width / 12 + 3; i++)
                {
                    var c = SpriteLib.Make("Cloud", bg, "bg_cloud",
                        new Vector2(rnd.Next(-10, d.Width), d.Height - 1.5f - rnd.Next(0, 4)), Order.Clouds);
                    c.gameObject.AddComponent<Parallax>().factor = 0.75f;
                    rt.WorldSprites.Add(c);
                }
            }
        }
    }
}
