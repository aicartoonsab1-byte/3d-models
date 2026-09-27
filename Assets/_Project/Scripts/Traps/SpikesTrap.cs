using System.Collections;
using UnityEngine;

namespace Sharik
{
    public class SpikesTrap : TrapBase
    {
        bool _up;
        BoxCollider2D _zone;

        public override string Title => "Шипы";
        public override float Cooldown => Tuning.SpikesCooldown;
        public override bool IsDangerous => _up;
        public override string DescribeState() => _up ? "шипы ТОРЧАТ" : Awake ? "шипы шевелятся и выскакивают сами" : "шипы спрятаны (подозрительно)";
        protected override float AutoCooldown => 2.6f;
        protected override bool WantsAutoAct(BallController b) => Near(b, Center, 9f);   // свой ритм, пока шарик рядом

        public static SpikesTrap Create(Transform parent, int x, int y, LevelRuntime rt)
        {
            var t = Spawn<SpikesTrap>(parent, x, y, rt, "trap_spikes_off");
            t._zone = t.gameObject.AddComponent<BoxCollider2D>();
            t._zone.isTrigger = true;
            t._zone.size = new Vector2(0.8f, 0.55f);
            t._zone.offset = new Vector2(0, -0.2f);
            return t;
        }

        protected override void OnTrigger() => StartCoroutine(Run());

        IEnumerator Run()
        {
            Sfx.Play(Sfx.Id.Spikes);
            _up = true;
            Sr.sprite = SpriteLib.Get("trap_spikes_on");
            StartCoroutine(Shake(transform));
            yield return new WaitForSeconds(Awake ? 1.2f : Tuning.SpikesActive);
            _up = false;
            Sr.sprite = SpriteLib.Get("trap_spikes_off");
        }

        void OnTriggerStay2D(Collider2D other)
        {
            if (!_up) return;
            var b = BallHit.Get(other);
            if (b != null && b.IsAlive) b.Die(DeathKind.Spikes);
        }
    }
}
