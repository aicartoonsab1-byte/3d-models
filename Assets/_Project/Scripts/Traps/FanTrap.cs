using System.Collections;
using UnityEngine;

namespace Sharik
{
    /// <summary>Вентилятор: сдувает шарик вверх (и об потолок — в лепёшку).</summary>
    public class FanTrap : TrapBase
    {
        bool _on;
        BallController _inside;
        readonly SpriteRenderer[] _wind = new SpriteRenderer[6];

        public override string Title => "Вентилятор";
        public override float Cooldown => Tuning.FanCooldown;
        public override bool IsDangerous => _on;
        public override string DescribeState() => _on ? "вентилятор ДУЕТ вверх" : "выключенный вентилятор";

        public static FanTrap Create(Transform parent, int x, int y, LevelRuntime rt)
        {
            var t = Spawn<FanTrap>(parent, x, y, rt, "trap_fan_0");
            var zone = t.gameObject.AddComponent<BoxCollider2D>();
            zone.isTrigger = true;
            zone.size = new Vector2(0.9f, Tuning.FanHeight);
            zone.offset = new Vector2(0, Tuning.FanHeight / 2f);
            for (int i = 0; i < t._wind.Length; i++)
            {
                t._wind[i] = SpriteLib.Make("Wind", t.transform, "fx_wind", Vector2.zero, Order.Fx);
                t._wind[i].enabled = false;
            }
            return t;
        }

        protected override void OnTrigger() => StartCoroutine(Run());

        IEnumerator Run()
        {
            Sfx.Play(Sfx.Id.Fan);
            _on = true;
            float t = 0;
            while (t < Tuning.FanActive)
            {
                t += Time.deltaTime;
                Sr.sprite = SpriteLib.Get(((int)(t * 20)) % 2 == 0 ? "trap_fan_0" : "trap_fan_1");
                for (int i = 0; i < _wind.Length; i++)
                {
                    _wind[i].enabled = true;
                    float ph = (t * 1.6f + i / (float)_wind.Length) % 1f;
                    _wind[i].transform.localPosition = new Vector3(Mathf.Sin(i * 2.3f + t * 6) * 0.3f, ph * Tuning.FanHeight, 0);
                }
                yield return null;
            }
            foreach (var w in _wind) w.enabled = false;
            Sr.sprite = SpriteLib.Get("trap_fan_0");
            _on = false;
        }

        void OnTriggerEnter2D(Collider2D o) { var b = BallHit.Get(o); if (b != null) _inside = b; }
        void OnTriggerExit2D(Collider2D o) { if (BallHit.Get(o) == _inside) _inside = null; }

        void FixedUpdate()
        {
            if (!_on || _inside == null || !_inside.IsAlive) return;
            var rb = _inside.Body;
            rb.AddForce(Vector2.up * Tuning.FanForce);
            var v = rb.Vel();
            if (v.y > 14f) rb.SetVel(new Vector2(v.x, 14f));
        }
    }
}
