using System.Collections;
using UnityEngine;

namespace Sharik
{
    /// <summary>Пресс. Падает, расплющивает шарик в лепёшку (без смерти — он потом соберётся), поднимается.</summary>
    public class CrusherTrap : TrapBase
    {
        Rigidbody2D _rb;
        float _topY, _bottomY;
        bool _falling, _down;
        SpriteRenderer _chain;

        public override string Title => "Пресс";
        public override float Cooldown => Tuning.CrusherCooldown;
        public override bool IsDangerous => _falling || _down;
        public override string DescribeState() => _falling ? "пресс ПАДАЕТ" : _down ? "пресс внизу" : "над головой висит пресс";

        public static CrusherTrap Create(Transform parent, int x, int y, LevelRuntime rt)
        {
            var t = Spawn<CrusherTrap>(parent, x, y, rt, "trap_crusher");
            t._topY = y + 0.5f;
            int yy = y - 1;
            while (yy >= 0 && !rt.Grid.IsSupport(x, yy)) yy--;
            // останавливается чуть выше пола, чтобы из-под пресса торчала лепёшка
            t._bottomY = (yy >= 0 ? yy + 1f : -6f) + 0.5f + 0.22f;

            t._rb = t.gameObject.AddComponent<Rigidbody2D>();
            t._rb.bodyType = RigidbodyType2D.Kinematic;
            t._rb.interpolation = RigidbodyInterpolation2D.Interpolate;
            var col = t.gameObject.AddComponent<BoxCollider2D>();
            col.size = new Vector2(0.98f, 0.98f);

            // цепь до потолка уровня
            t._chain = SpriteLib.Make("Chain", t.transform, "trap_chain", Vector2.zero, Order.Traps - 1);
            t._chain.drawMode = SpriteDrawMode.Tiled;
            t.UpdateChain();
            return t;
        }

        void UpdateChain()
        {
            float top = Rt.Data.Height + 1f;
            float len = Mathf.Max(0.01f, top - (transform.position.y + 0.5f));
            _chain.size = new Vector2(1f, len);
            _chain.transform.localPosition = new Vector3(0, 0.5f + len / 2f, 0);
        }

        protected override void OnTrigger() => StartCoroutine(Run());

        IEnumerator Run()
        {
            Sfx.Play(Sfx.Id.CrusherArm);
            yield return Shake(transform, 0.2f);      // предупреждение: дрожит перед падением
            _falling = true;
            while (_rb.position.y > _bottomY)
            {
                var next = Mathf.Max(_bottomY, _rb.position.y - Tuning.CrusherFallSpeed * Time.fixedDeltaTime);
                _rb.MovePosition(new Vector2(_rb.position.x, next));
                SquashBallBelow();
                yield return new WaitForFixedUpdate();
            }
            _falling = false; _down = true;
            Sfx.Play(Sfx.Id.CrusherSlam);
            CameraRig.Shake(0.15f, 0.12f);
            SquashBallBelow();
            yield return new WaitForSeconds(Tuning.CrusherHold);
            while (_rb.position.y < _topY)
            {
                var next = Mathf.Min(_topY, _rb.position.y + Tuning.CrusherRiseSpeed * Time.fixedDeltaTime);
                _rb.MovePosition(new Vector2(_rb.position.x, next));
                yield return new WaitForFixedUpdate();
            }
            _down = false;
        }

        void SquashBallBelow()
        {
            var bottom = _rb.position.y - 0.5f;
            var hits = Physics2D.OverlapBoxAll(new Vector2(_rb.position.x, bottom - 0.35f), new Vector2(0.9f, 0.7f), 0);
            foreach (var h in hits)
            {
                var b = BallHit.Get(h);
                if (b != null && b.IsAlive) b.Squash(transform.position.x);
            }
        }

        void LateUpdate() => UpdateChain();
    }
}
