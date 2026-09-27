using UnityEngine;

namespace Sharik
{
    /// <summary>
    /// Облачка над шариком: реплика вслух (белая рамка + хвостик, печатается по буквам в такт голосу)
    /// и мысль про себя (сиреневое облачко с кружочками). Пока нейросеть думает — облачко «...».
    /// </summary>
    public class ThoughtBubble : MonoBehaviour
    {
        public Transform Target;
        string _say = "", _thought = "";
        float _sayStart, _sayUntil, _thoughtUntil;
        bool _thinking;

        public bool SpeechBusy => Time.time < _sayUntil;

        public void Say(string text)
        {
            _say = text;
            _sayStart = Time.time;
            _sayUntil = Time.time + text.Length / Tuning.VoiceCharsPerSecond + 1.6f;
        }

        public void Think(string text)
        {
            _thought = text;
            _thoughtUntil = Time.time + Mathf.Clamp(text.Length * 0.06f, 2.5f, 7f);
        }

        public void ShowThinking(bool on) => _thinking = on;

        public void Clear() { _sayUntil = 0; _thoughtUntil = 0; _thinking = false; }

        void OnGUI()
        {
            if (Target == null || Camera.main == null) return;
            var sp = Camera.main.WorldToScreenPoint(Target.position + Vector3.up * 0.7f);
            if (sp.z < 0) return;
            float x = sp.x, y = Screen.height - sp.y;
            float maxW = Screen.width * 0.34f;
            int px = UiStyle.Px;

            float bottom = y;
            if (Time.time < _sayUntil && !string.IsNullOrEmpty(_say))
            {
                int shown = Mathf.Clamp(Mathf.CeilToInt((Time.time - _sayStart) * Tuning.VoiceCharsPerSecond), 0, _say.Length);
                var st = UiStyle.Speech;
                var content = new GUIContent(_say);
                float w = Mathf.Min(maxW, st.CalcSize(content).x);
                float h = st.CalcHeight(content, w);
                var r = Clamp(new Rect(x - w * 0.3f, bottom - h - 6 * px, w, h));
                GUI.Box(r, _say.Substring(0, shown), st);
                // хвостик к шарику
                GUI.color = new Color(0.06f, 0.06f, 0.1f);
                GUI.DrawTexture(new Rect(Mathf.Clamp(x, r.x + 3 * px, r.xMax - 6 * px), r.yMax - px, 3 * px, 3 * px), UiStyle.White);
                GUI.color = new Color(0.99f, 0.99f, 0.99f);
                GUI.DrawTexture(new Rect(Mathf.Clamp(x, r.x + 3 * px, r.xMax - 6 * px) + px, r.yMax - px, px, 2 * px), UiStyle.White);
                GUI.color = Color.white;
                bottom = r.y - 2 * px;
            }

            string thought = Time.time < _thoughtUntil ? _thought : _thinking ? Dots() : null;
            if (!string.IsNullOrEmpty(thought))
            {
                var st = UiStyle.Thought;
                var content = new GUIContent(thought);
                float w = Mathf.Min(maxW * 0.9f, st.CalcSize(content).x);
                float h = st.CalcHeight(content, w);
                var r = Clamp(new Rect(x - w * 0.5f + 8 * px, bottom - h - 8 * px, w, h));
                GUI.Box(r, thought, st);
                // кружочки мыслей
                GUI.color = new Color(0.85f, 0.87f, 1f, 0.93f);
                GUI.DrawTexture(new Rect(x + 2 * px, r.yMax + 2 * px, 3 * px, 3 * px), UiStyle.White);
                GUI.DrawTexture(new Rect(x, r.yMax + 6 * px, 2 * px, 2 * px), UiStyle.White);
                GUI.color = Color.white;
            }
        }

        static string Dots() => new string('.', 1 + (int)(Time.time * 3f) % 3) + " (думает)";

        static Rect Clamp(Rect r)
        {
            r.x = Mathf.Clamp(r.x, 4, Screen.width - r.width - 4);
            r.y = Mathf.Clamp(r.y, 4, Screen.height - r.height - 4);
            return r;
        }
    }
}
