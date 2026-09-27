using System;
using System.Collections.Generic;
using UnityEngine;

namespace Sharik
{
    /// <summary>Офлайн-фразы шарика: мгновенные реакции и запасной мозг, если нейросеть не запущена.</summary>
    public class PhraseBank
    {
        [Serializable] class Entry { public string key; public int stage; public string mood; public string[] lines; }
        [Serializable] class Root { public Entry[] entries; }

        readonly List<Entry> _entries = new List<Entry>();
        readonly Dictionary<string, int> _lastIdx = new Dictionary<string, int>();

        public PhraseBank()
        {
            var ta = Resources.Load<TextAsset>("Brain/phrases_ru");
            if (ta == null) return;
            var root = JsonUtility.FromJson<Root>(ta.text);
            if (root?.entries != null) _entries.AddRange(root.entries);
        }

        /// <summary>Фраза по ключу для стадии прозрения (ищет точную стадию, затем ближайшую младшую, затем «любую»).</summary>
        public bool Pick(string key, int stage, out string line, out string mood)
        {
            line = null; mood = "neutral";
            Entry best = null;
            foreach (var e in _entries)
            {
                if (e.key != key) continue;
                if (e.stage == stage) { best = e; break; }
                if (e.stage < stage && (best == null || e.stage > best.stage)) best = e;
            }
            if (best == null || best.lines == null || best.lines.Length == 0) return false;
            string k = key + best.stage;
            if (!_lastIdx.TryGetValue(k, out int last)) last = -1;
            int i = UnityEngine.Random.Range(0, best.lines.Length);
            if (best.lines.Length > 1 && i == last) i = (i + 1) % best.lines.Length;   // не повторяемся подряд
            _lastIdx[k] = i;
            line = best.lines[i];
            mood = string.IsNullOrEmpty(best.mood) ? "neutral" : best.mood;
            return true;
        }
    }
}
