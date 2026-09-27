using System.Collections.Generic;
using UnityEngine;

namespace Sharik
{
    /// <summary>
    /// Управление ловушками со стороны игрока: клик по ловушке или клавиши 1–9
    /// (номера получают ловушки, которые сейчас на экране, слева направо).
    /// </summary>
    public class TrapController : MonoBehaviour
    {
        public readonly List<TrapBase> OnScreen = new List<TrapBase>();
        public int TotalFired;

        void Update()
        {
            var gm = GameManager.I;
            if (gm == null || gm.Level == null || gm.InputLocked) return;
            var cam = Camera.main;

            OnScreen.Clear();
            foreach (var t in gm.Level.Traps)
            {
                t.Hotkey = 0;
                if (t.Disabled) continue;
                var vp = cam.WorldToViewportPoint(t.Center);
                if (vp.x > 0.01f && vp.x < 0.99f && vp.y > 0.01f && vp.y < 0.99f) OnScreen.Add(t);
            }
            OnScreen.Sort((a, b) => a.Center.x.CompareTo(b.Center.x));
            for (int i = 0; i < OnScreen.Count && i < 9; i++) OnScreen[i].Hotkey = i + 1;

            int digit = InputShim.DigitDown();
            if (digit > 0 && digit <= OnScreen.Count) Fire(OnScreen[digit - 1]);

            if (InputShim.ClickDown())
            {
                Vector2 wp = cam.ScreenToWorldPoint(InputShim.MousePos());
                TrapBase best = null;
                float bestD = 1.1f;
                foreach (var t in OnScreen)
                {
                    float d = Vector2.Distance(wp, t.Center);
                    if (t is CrusherTrap) d = Vector2.Distance(wp, t.transform.position);
                    if (d < bestD) { bestD = d; best = t; }
                }
                if (best != null) Fire(best);
            }
        }

        void Fire(TrapBase t)
        {
            if (t.Trigger()) TotalFired++;
            else Sfx.Play(Sfx.Id.Denied);
        }
    }
}
