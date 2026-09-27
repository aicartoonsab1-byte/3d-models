using UnityEngine;

namespace Sharik
{
    /// <summary>Интерфейс: заголовки, номера над ловушками, счётчики, статус нейросети, пауза, отладка, финал.</summary>
    public class Hud : MonoBehaviour
    {
        public string Big, Small;
        public float BigAlpha;
        public float Fade;              // 0..1 затемнение экрана
        public bool ShowDebug;

        void OnGUI()
        {
            var gm = GameManager.I;
            if (gm == null) return;
            int px = UiStyle.Px;
            float fs = UiStyle.Label.fontSize;

            if (gm.Level != null && gm.Ball != null && gm.Ball.State != BallState.Gone && Fade < 0.99f)
            {
                // номера ловушек
                foreach (var t in gm.Traps.OnScreen)
                {
                    if (t.Hotkey == 0) continue;
                    var sp = Camera.main.WorldToScreenPoint(t.LabelPoint);
                    var r = new Rect(sp.x - fs * 0.45f, Screen.height - sp.y - fs * 0.6f, fs * 0.95f, fs * 1.05f);
                    GUI.color = t.Ready ? new Color(0.1f, 0.1f, 0.15f, 0.85f) : new Color(0.3f, 0.1f, 0.1f, 0.7f);
                    GUI.DrawTexture(r, UiStyle.White);
                    if (!t.Ready)
                    {
                        GUI.color = new Color(1f, 0.3f, 0.3f, 0.8f);
                        GUI.DrawTexture(new Rect(r.x, r.yMax - px, r.width * (1 - t.CooldownLeft01), px), UiStyle.White);
                    }
                    GUI.color = Color.white;
                    var st = UiStyle.Label;
                    var a = st.alignment; st.alignment = TextAnchor.MiddleCenter;
                    UiStyle.Shadowed(r, t.Hotkey.ToString(), st, t.Ready ? new Color(0.99f, 0.85f, 0.24f) : new Color(0.6f, 0.6f, 0.6f));
                    st.alignment = a;
                }

                // верхняя строка
                UiStyle.Shadowed(new Rect(10, 8, Screen.width * 0.6f, fs * 1.5f), gm.Level.Data.title, UiStyle.Label, Color.white);
                string stats = $"Лепёшек: {gm.Ball.Splats}   Смертей: {gm.Ball.Deaths}   Ловушек: {gm.Traps.TotalFired}";
                var sst = UiStyle.Small;
                var al = sst.alignment; sst.alignment = TextAnchor.UpperRight;
                UiStyle.Shadowed(new Rect(Screen.width * 0.4f - 10, 8, Screen.width * 0.6f, fs * 1.5f), stats, sst, new Color(1f, 0.85f, 0.5f));
                sst.alignment = al;

                // нижняя строка
                var br = gm.Brain != null && gm.Brain.Llm != null ? gm.Brain.Llm.Status : "—";
                string mode = gm.Cfg.useLlm ? $"Нейросеть: {br}" : "Нейросеть выключена (F2) — офлайн-фразы";
                UiStyle.Shadowed(new Rect(10, Screen.height - fs * 1.4f - 6, Screen.width, fs * 1.4f),
                    "Мешай шарику: клик по ловушке или 1–9 · R — заново · Esc — пауза · F1 — мысли нейросети · M — звук   |   " + mode,
                    UiStyle.Small, new Color(1, 1, 1, 0.75f));

                if (ShowDebug && gm.Brain != null) DrawDebug(gm);
            }

            if (Fade > 0)
            {
                GUI.color = new Color(0, 0, 0, Fade);
                GUI.DrawTexture(new Rect(0, 0, Screen.width, Screen.height), UiStyle.White);
                GUI.color = Color.white;
            }
            if (!string.IsNullOrEmpty(Big) && BigAlpha > 0)
            {
                UiStyle.Shadowed(new Rect(0, Screen.height * 0.28f, Screen.width, fs * 4), Big, UiStyle.Big, new Color(1, 1, 1, BigAlpha));
                if (!string.IsNullOrEmpty(Small))
                {
                    var st = UiStyle.Small;
                    var a = st.alignment; st.alignment = TextAnchor.UpperCenter;
                    UiStyle.Shadowed(new Rect(Screen.width * 0.15f, Screen.height * 0.28f + fs * 4, Screen.width * 0.7f, Screen.height * 0.5f),
                        Small, st, new Color(1, 1, 1, BigAlpha));
                    st.alignment = a;
                }
            }
            if (gm.Paused)
            {
                GUI.color = new Color(0, 0, 0, 0.5f);
                GUI.DrawTexture(new Rect(0, 0, Screen.width, Screen.height), UiStyle.White);
                GUI.color = Color.white;
                UiStyle.Shadowed(new Rect(0, Screen.height * 0.35f, Screen.width, fs * 4), "ПАУЗА", UiStyle.Big, Color.white);
                var st = UiStyle.Small; var a = st.alignment; st.alignment = TextAnchor.UpperCenter;
                UiStyle.Shadowed(new Rect(0, Screen.height * 0.35f + fs * 4, Screen.width, fs * 6),
                    "Esc — продолжить · N / P — следующий / предыдущий уровень · F2 — вкл/выкл нейросеть", st, Color.white);
                st.alignment = a;
            }
        }

        void DrawDebug(GameManager gm)
        {
            var llm = gm.Brain.Llm;
            string text = $"<b>НАМЕРЕНИЕ:</b> {gm.Brain.Current}   <b>стадия:</b> {gm.Brain.Awareness}\n" +
                          $"<b>ПАМЯТЬ:</b>\n{gm.Brain.MemoryDump()}\n" +
                          $"<b>ПОСЛЕДНИЙ ЗАПРОС:</b>\n{Trim(llm.LastRequest, 1200)}\n<b>ОТВЕТ:</b>\n{Trim(llm.LastResponse, 600)}";
            var st = UiStyle.Panel;
            st.richText = true;
            float w = Screen.width * 0.42f;
            float h = Mathf.Min(Screen.height * 0.75f, st.CalcHeight(new GUIContent(text), w));
            GUI.Box(new Rect(Screen.width - w - 10, 40, w, h), text, st);
        }

        static string Trim(string s, int n) => string.IsNullOrEmpty(s) ? "—" : s.Length > n ? s.Substring(0, n) + "…" : s;
    }
}
