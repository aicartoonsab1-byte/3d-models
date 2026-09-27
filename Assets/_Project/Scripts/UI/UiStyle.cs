using UnityEngine;

namespace Sharik
{
    /// <summary>Пиксельные стили IMGUI: рамки-«окошки» в духе NES, генерируются кодом.</summary>
    public static class UiStyle
    {
        static Texture2D Box(Color fill, Color border, int b = 1)
        {
            int n = 2 * b + 2;
            var t = new Texture2D(n, n) { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp };
            for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
                t.SetPixel(x, y, x < b || y < b || x >= n - b || y >= n - b ? border : fill);
            t.Apply();
            return t;
        }

        static GUIStyle _speech, _thought, _label, _big, _small, _panel;
        static int _forHeight;
        public static Texture2D White;

        public static int Px => Mathf.Max(1, Screen.height / 180);       // размер «пикселя» интерфейса

        static void Ensure()
        {
            if (_speech != null && _forHeight == Screen.height) return;
            _forHeight = Screen.height;
            int fs = Mathf.Max(12, Screen.height / 38);
            White = Box(Color.white, Color.white);

            _speech = new GUIStyle
            {
                normal = { background = Box(new Color(0.99f, 0.99f, 0.99f), new Color(0.06f, 0.06f, 0.1f), 2), textColor = new Color(0.06f, 0.06f, 0.1f) },
                border = new RectOffset(2, 2, 2, 2),
                padding = new RectOffset(fs / 2, fs / 2, fs / 3, fs / 3),
                fontSize = fs, wordWrap = true, alignment = TextAnchor.MiddleLeft, richText = false,
            };
            _thought = new GUIStyle(_speech)
            {
                normal = { background = Box(new Color(0.85f, 0.87f, 1f, 0.93f), new Color(0.45f, 0.47f, 0.7f), 2), textColor = new Color(0.25f, 0.25f, 0.45f) },
                fontStyle = FontStyle.Italic,
                fontSize = Mathf.RoundToInt(fs * 0.9f),
            };
            _label = new GUIStyle { fontSize = fs, normal = { textColor = Color.white }, alignment = TextAnchor.UpperLeft, richText = true };
            _big = new GUIStyle(_label) { fontSize = fs * 3, alignment = TextAnchor.MiddleCenter, fontStyle = FontStyle.Bold };
            _small = new GUIStyle(_label) { fontSize = Mathf.RoundToInt(fs * 0.8f), wordWrap = true };
            _panel = new GUIStyle(_small)
            {
                normal = { background = Box(new Color(0.05f, 0.05f, 0.1f, 0.85f), new Color(0.9f, 0.9f, 1f), 1), textColor = new Color(0.8f, 1f, 0.8f) },
                border = new RectOffset(1, 1, 1, 1), padding = new RectOffset(8, 8, 6, 6), fontSize = Mathf.RoundToInt(fs * 0.6f),
            };
        }

        public static GUIStyle Speech { get { Ensure(); return _speech; } }
        public static GUIStyle Thought { get { Ensure(); return _thought; } }
        public static GUIStyle Label { get { Ensure(); return _label; } }
        public static GUIStyle Big { get { Ensure(); return _big; } }
        public static GUIStyle Small { get { Ensure(); return _small; } }
        public static GUIStyle Panel { get { Ensure(); return _panel; } }

        public static void Shadowed(Rect r, string text, GUIStyle st, Color c)
        {
            var old = st.normal.textColor;
            st.normal.textColor = new Color(0, 0, 0, c.a * 0.8f);
            GUI.Label(new Rect(r.x + Px, r.y + Px, r.width, r.height), text, st);
            st.normal.textColor = c;
            GUI.Label(r, text, st);
            st.normal.textColor = old;
        }
    }
}
