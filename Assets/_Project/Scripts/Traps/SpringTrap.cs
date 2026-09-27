using System.Collections;
using UnityEngine;

namespace Sharik
{
    public class SpringTrap : TrapBase
    {
        bool _launching;

        public override string Title => "Пружина";
        public override float Cooldown => Tuning.SpringCooldown;
        public override bool IsDangerous => _launching;
        public override string DescribeState() => "пружинка на земле (милая?)";

        public static SpringTrap Create(Transform parent, int x, int y, LevelRuntime rt)
        {
            var t = Spawn<SpringTrap>(parent, x, y, rt, "trap_spring_idle");
            // Коллайдера нет: шарик катится «сквозь» пружину, а подбрасывает его OverlapBox при срабатывании.
            return t;
        }

        protected override void OnTrigger() => StartCoroutine(Run());

        IEnumerator Run()
        {
            _launching = true;
            Sfx.Play(Sfx.Id.Spring);
            Sr.sprite = SpriteLib.Get("trap_spring_launch");
            var hits = Physics2D.OverlapBoxAll(Center + new Vector2(0, 0.6f), new Vector2(1.3f, 1.2f), 0);
            foreach (var h in hits)
            {
                var b = BallHit.Get(h);
                if (b != null && b.IsAlive) b.Launch(new Vector2(b.Body.Vel().x, Tuning.SpringLaunchSpeed));
            }
            yield return new WaitForSeconds(0.35f);
            Sr.sprite = SpriteLib.Get("trap_spring_idle");
            _launching = false;
        }
    }
}
