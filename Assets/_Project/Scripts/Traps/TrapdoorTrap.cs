using System.Collections;
using UnityEngine;

namespace Sharik
{
    public class TrapdoorTrap : TrapBase
    {
        BoxCollider2D _col;
        public bool IsOpen { get; private set; }

        public override string Title => "Люк";
        public override float Cooldown => Tuning.TrapdoorCooldown;
        public override bool IsDangerous => IsOpen;
        public override string DescribeState() => IsOpen ? "люк ОТКРЫТ, под ним бездна" : "деревянный люк в полу";

        public static TrapdoorTrap Create(Transform parent, int x, int y, LevelRuntime rt)
        {
            var t = Spawn<TrapdoorTrap>(parent, x, y, rt, "trap_trapdoor_closed");
            t._col = t.gameObject.AddComponent<BoxCollider2D>();
            t._col.size = new Vector2(1f, 6f / 16f);
            t._col.offset = new Vector2(0, 0.5f - 3f / 16f);
            rt.Grid.RegisterTrapdoor(new Vector2Int(x, y), t);
            return t;
        }

        protected override void OnTrigger() => StartCoroutine(Run());

        IEnumerator Run()
        {
            Sfx.Play(Sfx.Id.Trapdoor);
            IsOpen = true;
            _col.enabled = false;
            Sr.sprite = SpriteLib.Get("trap_trapdoor_open");
            yield return new WaitForSeconds(Tuning.TrapdoorOpen);
            IsOpen = false;
            _col.enabled = true;
            Sr.sprite = SpriteLib.Get("trap_trapdoor_closed");
        }
    }
}
