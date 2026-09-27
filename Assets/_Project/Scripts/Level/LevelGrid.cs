using System.Collections.Generic;
using UnityEngine;

namespace Sharik
{
    /// <summary>Логическая сетка уровня для «инстинкта» и органов чувств шарика.</summary>
    public class LevelGrid
    {
        public readonly LevelData Data;
        readonly Dictionary<Vector2Int, TrapdoorTrap> _trapdoors = new Dictionary<Vector2Int, TrapdoorTrap>();

        public LevelGrid(LevelData d) { Data = d; }
        public int W => Data.Width;
        public int H => Data.Height;

        public void RegisterTrapdoor(Vector2Int c, TrapdoorTrap t) => _trapdoors[c] = t;

        public bool IsSolid(int x, int y)
        {
            if (x < 0 || x >= W) return true;
            char c = Data.At(x, y);
            if (c == '#') return true;
            if (c == 'T') return !_trapdoors.TryGetValue(new Vector2Int(x, y), out var t) || !t.IsOpen;
            return false;
        }

        public bool IsPlatform(int x, int y) => Data.At(x, y) == '=';

        public bool IsSupport(int x, int y) => IsSolid(x, y) || IsPlatform(x, y);

        public bool IsStandable(int x, int y)
        {
            if (x < 0 || x >= W || y < 0 || y >= H) return false;
            return !IsSupport(x, y) && IsSupport(x, y - 1);
        }

        /// <summary>Есть ли хоть какой-то пол в колонке ниже y.</summary>
        public bool HasFloorBelow(int x, int y, out int floorY)
        {
            for (int yy = y - 1; yy >= 0; yy--)
                if (IsSupport(x, yy)) { floorY = yy + 1; return true; }
            floorY = -1;
            return false;
        }

        public static Vector2Int Cell(Vector2 p) => new Vector2Int(Mathf.FloorToInt(p.x), Mathf.FloorToInt(p.y));
        public static Vector2 Center(int x, int y) => new Vector2(x + 0.5f, y + 0.5f);
    }
}
