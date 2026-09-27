using UnityEngine;

namespace Sharik
{
    /// <summary>X — рассыпающийся блок: если шарик простоит на нём дольше CrumbleDelay, осыпается на CrumbleBack секунд.</summary>
    public class CrumbleBlock : MonoBehaviour
    {
        public Vector2Int Cell;
        public bool Gone { get; private set; }
        SpriteRenderer _sr;
        BoxCollider2D _col;
        float _touch, _backAt;

        public static CrumbleBlock Create(Transform parent, int x, int y, LevelRuntime rt)
        {
            var sr = SpriteLib.Make("Crumble", parent, "mech_crumble", LevelGrid.Center(x, y), Order.Tiles);
            var cb = sr.gameObject.AddComponent<CrumbleBlock>();
            cb.Cell = new Vector2Int(x, y);
            cb._sr = sr;
            cb._col = sr.gameObject.AddComponent<BoxCollider2D>();
            cb._col.size = Vector2.one;
            rt.Grid.RegisterCrumble(cb.Cell, cb);
            rt.WorldSprites.Add(sr);
            return cb;
        }

        void Update()
        {
            var ball = GameManager.I != null ? GameManager.I.Ball : null;
            if (Gone)
            {
                // возвращается, когда время вышло и шарик не внутри
                if (Time.time > _backAt && (ball == null || Vector2.Distance(ball.transform.position, LevelGrid.Center(Cell.x, Cell.y)) > 1f))
                {
                    Gone = false; _col.enabled = true; _sr.enabled = true; _sr.sprite = SpriteLib.Get("mech_crumble");
                }
                return;
            }
            bool onMe = ball != null && ball.IsAlive && ball.Grounded && LevelGrid.Cell((Vector2)ball.transform.position - new Vector2(0, Tuning.BallRadius + 0.05f)) == Cell;
            _touch = onMe ? _touch + Time.deltaTime : Mathf.Max(0, _touch - Time.deltaTime);
            _sr.sprite = SpriteLib.Get(_touch > 0.2f ? "mech_crumble_crack" : "mech_crumble");
            transform.localPosition = (Vector3)LevelGrid.Center(Cell.x, Cell.y) + (_touch > 0.2f ? new Vector3(Random.Range(-1, 2) / 16f, 0, 0) : Vector3.zero);
            if (_touch > Tuning.CrumbleDelay)
            {
                Gone = true; _touch = 0; _backAt = Time.time + Tuning.CrumbleBack;
                _col.enabled = false; _sr.enabled = false;
                Sfx.Play(Sfx.Id.Trapdoor);
                Fx.Burst(LevelGrid.Center(Cell.x, Cell.y), new Color32(0x1c, 0x17, 0x14, 255), new Color32(0xe2, 0x61, 0x5c, 255), 8, -20f);
                GameEvents.RaiseWorld("Блок под тобой рассыпался!");
            }
        }
    }

    /// <summary>@ — портал: пары слева направо, вход переносит шарика к выходу.</summary>
    public class Portal : MonoBehaviour
    {
        public Vector2Int Cell;
        public Portal Exit;         // null — это выход
        SpriteRenderer _sr;
        static float _cooldownUntil;

        public static Portal Create(Transform parent, int x, int y, LevelRuntime rt)
        {
            var sr = SpriteLib.Make("Portal", parent, "mech_portal_0", new Vector2(x + 0.5f, y + 1f), Order.Objects);
            var p = sr.gameObject.AddComponent<Portal>();
            p.Cell = new Vector2Int(x, y);
            p._sr = sr;
            rt.WorldSprites.Add(sr);
            return p;
        }

        void Update()
        {
            _sr.sprite = SpriteLib.Get(((int)(Time.time * 4) + (Exit == null ? 1 : 0)) % 2 == 0 ? "mech_portal_0" : "mech_portal_1");
            if (Exit == null || Time.time < _cooldownUntil) return;
            var ball = GameManager.I != null ? GameManager.I.Ball : null;
            if (ball == null || !ball.IsAlive) return;
            var c = LevelGrid.Cell((Vector2)ball.transform.position - new Vector2(0, Tuning.BallRadius - 0.1f));
            if (c != Cell) return;
            _cooldownUntil = Time.time + Tuning.PortalCooldown;
            var to = new Vector2(Exit.Cell.x + 0.5f, Exit.Cell.y + Tuning.BallRadius + 0.02f);
            ball.Teleport(to);
            Sfx.Play(Sfx.Id.Glitch); Sfx.Play(Sfx.Id.Fragment);
            CameraRig.Shake(0.2f, 0.06f);
            Fx.Burst(to, new Color32(0xe2, 0x61, 0x5c, 255), new Color32(0xfa, 0xf3, 0xe1, 255), 10, 0f);
            GameEvents.RaiseWorld("Ты провалился в портал и вылетел в другом месте мира!");
        }
    }

    /// <summary>Тьма (уровень с "dark": true): чёрное полотно с мягкой дырой вокруг шарика.</summary>
    public class Darkness : MonoBehaviour
    {
        const int TexSize = 256;
        const float WorldSize = 64f;          // полотно 64×64 юнита — перекрывает экран
        const float HoleRadius = 3.6f;

        public static Darkness Create(Transform parent)
        {
            var tex = new Texture2D(TexSize, TexSize, TextureFormat.RGBA32, false) { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp };
            float c = TexSize / 2f, r = HoleRadius / WorldSize * TexSize;
            for (int y = 0; y < TexSize; y++)
            for (int x = 0; x < TexSize; x++)
            {
                float d = Mathf.Sqrt((x + 0.5f - c) * (x + 0.5f - c) + (y + 0.5f - c) * (y + 0.5f - c));
                float a = Mathf.Clamp01((d - r * 0.4f) / (r * 0.6f));
                a = Mathf.Round(a * 4f) / 4f * 0.93f;        // пиксельные ступеньки света
                tex.SetPixel(x, y, new Color(0.04f, 0.03f, 0.03f, a));
            }
            tex.Apply();
            var go = new GameObject("Darkness");
            go.transform.SetParent(parent, false);
            var sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = Sprite.Create(tex, new Rect(0, 0, TexSize, TexSize), new Vector2(0.5f, 0.5f), TexSize / WorldSize);
            sr.sortingOrder = 200;
            if (SpriteLib.Mat != null) sr.sharedMaterial = SpriteLib.Mat;
            return go.AddComponent<Darkness>();
        }

        void LateUpdate()
        {
            var ball = GameManager.I != null ? GameManager.I.Ball : null;
            if (ball == null) return;
            var p = ball.transform.position;
            float wob = Mathf.Sin(Time.time * 3f) * 0.05f;
            transform.position = new Vector3(p.x, p.y, 0);
            transform.localScale = Vector3.one * (1f + wob);
        }
    }

    /// <summary>Простые пиксельные частицы (крошки, искры, слёзы, пар).</summary>
    public static class Fx
    {
        public static void Burst(Vector2 at, Color a, Color b, int n, float gravity, float speed = 1f, float life = 0.8f)
        {
            for (int i = 0; i < n; i++)
            {
                var sr = SpriteLib.Make("Fx", null, "fx_pixel", at + Random.insideUnitCircle * 0.4f, Order.Fx);
                sr.color = i % 2 == 0 ? a : b;
                sr.transform.localScale = Vector3.one * 0.5f;
                var p = sr.gameObject.AddComponent<Particle>();
                p.Vel = new Vector2(Random.Range(-1f, 1f), Random.Range(0.2f, 1.5f)) * speed;
                p.Gravity = gravity; p.Life = life; p.Delay = i * 0.02f;
            }
        }
    }

    public class Particle : MonoBehaviour
    {
        public Vector2 Vel;
        public float Gravity, Life = 0.8f, Delay;
        float _t;
        SpriteRenderer _sr;
        void Awake() { _sr = GetComponent<SpriteRenderer>(); }
        void Update()
        {
            _t += Time.deltaTime;
            if (_t < Delay) { _sr.enabled = false; return; }
            _sr.enabled = true;
            Vel.y += Gravity * Time.deltaTime;
            transform.position += (Vector3)(Vel * Time.deltaTime);
            var c = _sr.color; c.a = 1f - (_t - Delay) / Life; _sr.color = c;
            if (_t - Delay > Life) Destroy(gameObject);
        }
    }
}
