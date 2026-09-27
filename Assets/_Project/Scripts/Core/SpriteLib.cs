using System.Collections.Generic;
using UnityEngine;

namespace Sharik
{
    /// <summary>Загрузка пиксельных спрайтов из Resources/Sprites с кэшем и страховкой от неверного импорта.</summary>
    public static class SpriteLib
    {
        static readonly Dictionary<string, Sprite> Cache = new Dictionary<string, Sprite>();
        static Material _mat;

        public static Sprite Get(string name)
        {
            if (Cache.TryGetValue(name, out var s)) return s;
            s = Resources.Load<Sprite>("Sprites/" + name);
            if (s == null)
            {
                // Текстура импортировалась не как Sprite — создаём спрайт сами.
                var tex = Resources.Load<Texture2D>("Sprites/" + name);
                if (tex != null)
                {
                    tex.filterMode = FilterMode.Point;
                    s = Sprite.Create(tex, new Rect(0, 0, tex.width, tex.height), new Vector2(0.5f, 0.5f),
                        Tuning.PixelsPerUnit, 0, SpriteMeshType.FullRect);
                }
                else
                {
                    Debug.LogWarning($"[Шарик] Нет спрайта Sprites/{name}. Запустите Tools/art/generate_sprites.py");
                    s = Sprite.Create(Texture2D.whiteTexture, new Rect(0, 0, 4, 4), new Vector2(0.5f, 0.5f), 4);
                }
            }
            Cache[name] = s;
            return s;
        }

        /// <summary>Неосвещаемый спрайтовый материал: одинаково выглядит в Built-in и в URP.</summary>
        public static Material Mat
        {
            get
            {
                if (_mat == null)
                {
                    var sh = Shader.Find("Sprites/Default");
                    if (sh != null) _mat = new Material(sh);
                }
                return _mat;
            }
        }

        public static SpriteRenderer Make(string goName, Transform parent, string sprite, Vector2 pos, int order)
        {
            var go = new GameObject(goName);
            if (parent != null) go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            var sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = Get(sprite);
            sr.sortingOrder = order;
            if (Mat != null) sr.sharedMaterial = Mat;
            return sr;
        }
    }

    /// <summary>Порядок отрисовки слоёв.</summary>
    public static class Order
    {
        public const int Sky = -100, Clouds = -90, Hills = -80, Tiles = 0, Objects = 10, Traps = 20,
            Ball = 30, Fx = 40;
    }
}
