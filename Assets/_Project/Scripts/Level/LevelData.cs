using System;
using UnityEngine;

namespace Sharik
{
    /// <summary>Формат уровня (JSON в Resources/Levels). Описание полей — Design/LEVEL_FORMAT.md.</summary>
    [Serializable]
    public class LevelData
    {
        public string id;
        public int order;
        public string title;
        public int act;
        public int awareness;         // 0..5 — стадия прозрения шарика
        public string palette;        // meadow | cave | city | glitch | void
        public string storyBeat;      // контекст для нейросети: что сейчас происходит в душе шарика
        public string goalHint;
        public bool final;
        public string[] intro;
        public string[] outro;
        public ScriptLine[] lines;
        public string[] fragments;
        public string[] grid;

        [NonSerialized] public int Width, Height;

        public static LevelData FromJson(string json)
        {
            var d = JsonUtility.FromJson<LevelData>(json);
            d.intro = d.intro ?? new string[0];
            d.outro = d.outro ?? new string[0];
            d.lines = d.lines ?? new ScriptLine[0];
            d.fragments = d.fragments ?? new string[0];
            d.grid = d.grid ?? new string[0];
            d.Height = d.grid.Length;
            d.Width = 0;
            foreach (var r in d.grid) d.Width = Mathf.Max(d.Width, r.Length);
            return d;
        }

        /// <summary>Символ в клетке (x вправо, y вверх; строка 0 JSON — верх уровня).</summary>
        public char At(int x, int y)
        {
            if (x < 0 || x >= Width || y < 0 || y >= Height) return '.';
            var row = grid[Height - 1 - y];
            return x < row.Length ? row[x] : '.';
        }
    }

    [Serializable]
    public class ScriptLine
    {
        public int x;
        public string text;
        public string mood;
    }
}
