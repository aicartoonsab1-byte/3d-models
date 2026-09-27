using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Sharik
{
    /// <summary>Органы чувств: что шарик видит вокруг (вещи с id для нейросети) и какой рельеф впереди.</summary>
    public static class Perception
    {
        public class Thing
        {
            public string Id, Key, What, State;
            public float Dx;
            public Vector2 Pos;
        }

        public static List<Thing> See(LevelRuntime lv, Vector2 ball)
        {
            var list = new List<Thing>();
            void Add(string id, string key, Vector2 p, string state)
            {
                float dx = p.x - ball.x;
                if (Mathf.Abs(dx) > 11f || Mathf.Abs(p.y - ball.y) > 7f) return;
                list.Add(new Thing { Id = id, Key = key, What = Mind.What(key), Dx = Mathf.Round(dx * 10f) / 10f, Pos = p, State = state });
            }
            foreach (var t in lv.Things) if (t.Tr != null) Add(t.Id, t.Key, t.Tr.position, null);
            for (int i = 0; i < lv.Traps.Count; i++)
            {
                var t = lv.Traps[i];
                string key = t is BossTrap b ? b.Kind : t is SpikesTrap ? "spikes" : t is CrusherTrap ? "crusher" :
                    t is TrapdoorTrap ? "trapdoor" : t is FanTrap ? "fan" : "spring";
                Add("trap" + i, key, t.Center, t.IsDangerous ? "ДЕЙСТВУЕТ прямо сейчас" : t.Awake ? "проснулся, может сработать сам" : "спит");
            }
            return list.OrderBy(t => Mathf.Abs(t.Dx)).Take(8).ToList();
        }
    }
}
