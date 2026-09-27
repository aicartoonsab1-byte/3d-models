using System.Collections;
using UnityEngine;

namespace Sharik
{
    /// <summary>
    /// Босс — огромное мистическое существо, самая большая «ловушка» игрока.
    /// Атакой управляет игрок (клик / цифра), у каждого вида своя атака:
    ///   stag    — Лунный Олень: топот, ударная волна подбрасывает шарик (→ лепёшка);
    ///   watcher — Всевидящий: стреляет взглядом, попадание = лепёшка;
    ///   worm    — Кодовый Червь: вырывается из-под земли прямо под шариком;
    ///   keeper  — Хранитель рубильника: ревёт и отбрасывает шарик назад.
    /// Боссы не твёрдые — шарик катится мимо / под ними (под брюхом Оленя).
    /// </summary>
    public class BossTrap : TrapBase
    {
        public string Kind;
        bool _attacking;
        float _nextBlink;
        Vector3 _home, _origin;
        float _walkT;
        SpriteRenderer _extra;      // пыль / тело червя

        public override string Title => Kind switch
        {
            "stag" => "Лунный Олень", "watcher" => "Всевидящий", "worm" => "Кодовый Червь", "keeper" => "Хранитель", _ => "Существо"
        };

        public override float Cooldown => Kind switch { "stag" => 3.5f, "watcher" => 3f, "worm" => 3f, "keeper" => 4.5f, _ => 4f };
        public override bool IsDangerous => _attacking;
        public override float AwakeDuration => Tuning.AwakeBoss;
        protected override float AutoCooldown => Cooldown * (1f + Tuning.BossFatigue * Acts);   // устаёт
        protected override float WarnTime => 0.01f;                                               // у боссов свой замах
        public override Vector2 Center => new Vector2(transform.localPosition.x, Cell.y + 0.5f);

        protected override bool WantsAutoAct(BallController b)
        {
            if (_attacking) return false;
            float dx = Mathf.Abs(b.transform.position.x - Center.x);
            return Kind switch
            {
                "stag" => dx < 5f && b.Grounded,
                "watcher" => dx < 9f,
                "worm" => dx < 12f,
                _ => dx < 8f,
            };
        }

        public override string DescribeState() => Kind switch
        {
            "stag" => _attacking ? "огромный Лунный Олень ВСТАЛ НА ДЫБЫ" : "огромный чёрный Лунный Олень с коралловыми рогами стоит над дорогой",
            "watcher" => _attacking ? "Всевидящий СТРЕЛЯЕТ взглядом" : "в воздухе парит Всевидящий — холм из глаз, и все смотрят на тебя",
            "worm" => _attacking ? "Кодовый Червь ВЫРЫВАЕТСЯ из земли" : "из земли выглядывает глаз Кодового Червя",
            "keeper" => _attacking ? "Хранитель РЕВЁТ" : "у рубильника лежит огромный Хранитель со звездой вместо глаза",
            _ => "странное существо",
        };

        public static BossTrap Create(Transform parent, int x, int y, LevelRuntime rt, string kind)
        {
            kind = string.IsNullOrEmpty(kind) ? "stag" : kind;
            string sprite = kind == "worm" ? "boss_worm_peek" : $"boss_{kind}_idle";
            var t = Spawn<BossTrap>(parent, x, y, rt, sprite);
            t.Kind = kind;
            t.Sr.sortingOrder = Order.Objects - 1;
            var s = t.Sr.sprite;
            float h = s.rect.height / Tuning.PixelsPerUnit;
            float lift = kind == "watcher" ? 2.5f : 0f;           // Всевидящий парит
            t.transform.localPosition = new Vector3(x + 0.5f, y + h / 2f + lift, 0);
            t._home = t.transform.localPosition;
            t._origin = t._home;
            t._nextBlink = Time.time + Random.Range(2f, 5f);
            if (kind == "worm")
            {
                t._extra = SpriteLib.Make("WormBody", parent, "boss_worm_idle", Vector2.zero, Order.Traps);
                t._extra.enabled = false;
                rt.WorldSprites.Add(t._extra);
            }
            return t;
        }

        protected override void Update()
        {
            base.Update();
            if (Disabled) return;
            Walk();
            // «живость»: моргание и дыхание
            if (!_attacking && Time.time > _nextBlink && Kind != "worm")
            {
                StartCoroutine(Blink());
                _nextBlink = Time.time + Random.Range(2.5f, 6f);
            }
            if (!_attacking)
            {
                float amp = Kind == "watcher" ? 3f : 1f;
                float off = Mathf.Round(Mathf.Sin(Time.time * (Kind == "watcher" ? 2f : 1.2f)) * amp) / Tuning.PixelsPerUnit;
                transform.localPosition = _home + new Vector3(0, off, 0);
            }
        }

        /// <summary>Проснувшийся Олень ходит за шариком (не сходя в пропасть), Всевидящий плывёт над ним.
        /// Уснув, оба возвращаются домой.</summary>
        void Walk()
        {
            if (_attacking || (Kind != "stag" && Kind != "watcher")) return;
            var b = GameManager.I != null ? GameManager.I.Ball : null;
            float target = Awake && b != null && b.IsAlive ? b.transform.position.x : _origin.x;
            float range = Kind == "stag" ? 6f : 10f;
            target = Mathf.Clamp(target, _origin.x - range, _origin.x + range);
            float d = target - _home.x;
            if (Kind == "stag")
            {
                if (Mathf.Abs(d) < (Awake ? 1.5f : 0.1f)) return;
                float nx = _home.x + Mathf.Sign(d) * Mathf.Min(Mathf.Abs(d), (Awake ? 1.6f : 1f) * Time.deltaTime);
                // ноги только на опоре — в пропасть не шагает
                if (!Rt.Grid.IsSupport(Mathf.FloorToInt(nx - 1.2f), Cell.y - 1) || !Rt.Grid.IsSupport(Mathf.FloorToInt(nx + 1.2f), Cell.y - 1)) return;
                _home.x = nx;
                Sr.flipX = d < 0;
                _walkT += Time.deltaTime;
                transform.localPosition = _home + new Vector3(0, Mathf.Round(Mathf.Abs(Mathf.Sin(_walkT * 8f))) / Tuning.PixelsPerUnit, 0);
            }
            else _home.x += d * Mathf.Min(1f, Time.deltaTime * (Awake ? 0.9f : 0.4f));
        }

        IEnumerator Blink()
        {
            Sr.sprite = SpriteLib.Get($"boss_{Kind}_blink");
            yield return new WaitForSeconds(0.15f);
            if (!_attacking) Sr.sprite = SpriteLib.Get($"boss_{Kind}_idle");
        }

        protected override void OnTrigger()
        {
            switch (Kind)
            {
                case "watcher": StartCoroutine(Gaze()); break;
                case "worm": StartCoroutine(Burst()); break;
                case "keeper": StartCoroutine(Roar()); break;
                default: StartCoroutine(Stomp()); break;
            }
        }

        BallController Ball => GameManager.I != null ? GameManager.I.Ball : null;

        // ---------------------------------------------------------------- Олень
        IEnumerator Stomp()
        {
            _attacking = true;
            Sr.sprite = SpriteLib.Get("boss_stag_atk");
            Sfx.Play(Sfx.Id.CrusherArm);
            yield return new WaitForSeconds(0.6f);      // замах: встаёт на дыбы — шарик успевает испугаться
            Sr.sprite = SpriteLib.Get("boss_stag_idle");
            Sfx.Play(Sfx.Id.CrusherSlam);
            CameraRig.Shake(0.35f, 0.2f);
            var wave = SpriteLib.Make("Shock", transform.parent, "fx_shock", new Vector2(Center.x, Cell.y + 0.25f), Order.Fx);
            var b = Ball;
            if (b != null && b.IsAlive && b.Grounded && Mathf.Abs(b.transform.position.x - Center.x) < 7f)
            {
                float away = Mathf.Sign(b.transform.position.x - Center.x + 0.01f);
                b.Launch(new Vector2(away * 3f, 18f));
            }
            for (float t = 0; t < 0.5f; t += Time.deltaTime)
            {
                wave.transform.localScale = new Vector3(1f + t * 8f, 1f, 1f);
                wave.color = new Color(1, 1, 1, 1f - t / 0.5f);
                yield return null;
            }
            Destroy(wave.gameObject);
            _attacking = false;
        }

        // ---------------------------------------------------------------- Всевидящий
        IEnumerator Gaze()
        {
            _attacking = true;
            Sr.sprite = SpriteLib.Get("boss_watcher_atk");
            Sfx.Play(Sfx.Id.Glitch);
            yield return new WaitForSeconds(0.4f);
            var b = Ball;
            if (b != null)
            {
                var orb = SpriteLib.Make("Gaze", transform.parent, "fx_gaze", transform.localPosition + Vector3.down * 0.3f, Order.Fx);
                orb.gameObject.AddComponent<GazeOrb>().Init(b, 8f);
                Sfx.Play(Sfx.Id.Fragment);
            }
            yield return new WaitForSeconds(0.4f);
            Sr.sprite = SpriteLib.Get("boss_watcher_idle");
            _attacking = false;
        }

        // ---------------------------------------------------------------- Червь
        IEnumerator Burst()
        {
            _attacking = true;
            var b = Ball;
            float x = Center.x;
            float floorY = Cell.y;
            if (b != null && b.IsAlive && Mathf.Abs(b.transform.position.x - Center.x) < 10f)
            {
                x = Mathf.Floor(b.transform.position.x) + 0.5f;
                floorY = Mathf.Floor(b.transform.position.y - Tuning.BallRadius + 0.1f);
            }
            // предупреждение: пыль из-под земли
            var dust = SpriteLib.Make("Dust", transform.parent, "fx_dust", new Vector2(x, floorY + 0.2f), Order.Fx);
            Sr.enabled = false;
            Sfx.Play(Sfx.Id.CrusherArm);
            for (float t = 0; t < 0.7f; t += Time.deltaTime)
            {
                dust.transform.localPosition = new Vector3(x + Random.Range(-2, 3) / 16f, floorY + 0.2f + Random.Range(0, 3) / 16f, 0);
                yield return null;
            }
            Destroy(dust.gameObject);
            _extra.enabled = true;
            _extra.sprite = SpriteLib.Get("boss_worm_atk");
            Sfx.Play(Sfx.Id.Spring);
            CameraRig.Shake(0.2f, 0.12f);
            float top = floorY + 1.5f;
            for (float t = 0; t < 0.18f; t += Time.deltaTime)
            {
                _extra.transform.localPosition = new Vector3(x, Mathf.Lerp(floorY - 1.5f, top, t / 0.18f), 0);
                yield return null;
            }
            b = Ball;
            if (b != null && b.IsAlive && Mathf.Abs(b.transform.position.x - x) < 1f && b.transform.position.y < floorY + 3f)
                b.Launch(new Vector2(0, 20f));
            _extra.sprite = SpriteLib.Get("boss_worm_idle");
            yield return new WaitForSeconds(0.8f);
            for (float t = 0; t < 0.5f; t += Time.deltaTime)
            {
                _extra.transform.localPosition = new Vector3(x, Mathf.Lerp(top, floorY - 1.5f, t / 0.5f), 0);
                yield return null;
            }
            _extra.enabled = false;
            Sr.enabled = true;
            _attacking = false;
        }

        // ---------------------------------------------------------------- Хранитель
        IEnumerator Roar()
        {
            _attacking = true;
            Sr.sprite = SpriteLib.Get("boss_keeper_atk");
            Sfx.Play(Sfx.Id.PowerDown, 0.3f);
            CameraRig.Shake(0.6f, 0.08f);
            var b = Ball;
            if (b != null && b.IsAlive && Mathf.Abs(b.transform.position.x - Center.x) < 10f)
            {
                float away = Mathf.Sign(b.transform.position.x - Center.x - 0.01f);
                b.Launch(new Vector2(away * 9f, 8f));
            }
            yield return new WaitForSeconds(1.2f);
            Sr.sprite = SpriteLib.Get("boss_keeper_idle");
            _attacking = false;
        }
    }

    /// <summary>Снаряд-взгляд Всевидящего: летит к шарику с лёгким самонаведением.</summary>
    public class GazeOrb : MonoBehaviour
    {
        BallController _target;
        Vector2 _vel;
        float _life = 3f;

        public void Init(BallController target, float speed)
        {
            _target = target;
            _vel = ((Vector2)target.transform.position - (Vector2)transform.position).normalized * speed;
        }

        void Update()
        {
            _life -= Time.deltaTime;
            if (_target == null || _life <= 0) { Destroy(gameObject); return; }
            var to = (Vector2)_target.transform.position - (Vector2)transform.position;
            _vel = Vector2.Lerp(_vel, to.normalized * _vel.magnitude, Time.deltaTime * 1.2f);
            transform.position += (Vector3)(_vel * Time.deltaTime);
            if (to.magnitude < 0.55f)
            {
                if (_target.IsAlive) _target.Squash(transform.position.x);
                Destroy(gameObject);
            }
        }
    }
}
