using UnityEngine;

namespace Sharik
{
    /// <summary>
    /// «Инстинкт» шарика — быстрые рефлексы между размышлениями нейросети.
    /// Нейросеть думает раз в несколько секунд и выбирает НАМЕРЕНИЕ (вперёд, ждать, прыгать, молиться...),
    /// а инстинкт каждый кадр решает, КОГДА и КАК прыгнуть, чтобы перепрыгнуть яму или залезть на ступеньку.
    /// Импульсивность добавляет ошибку в прыжки — отсюда смешные недолёты и перелёты.
    /// </summary>
    public class Navigator
    {
        readonly LevelGrid _g;
        public float Impulsivity = 0.5f;        // 0 — аккуратист, 1 — полный недотёпа
        public bool IgnoreDanger;               // режим YOLO
        public string LastObstacle = "";

        public Navigator(LevelGrid g) { _g = g; }

        static float G => -Physics2D.gravity.y * Tuning.GravityScale;

        public Vector2Int StandCell(Vector2 pos) =>
            new Vector2Int(Mathf.FloorToInt(pos.x), Mathf.FloorToInt(pos.y - Tuning.BallRadius + 0.1f));

        /// <summary>Вызывать каждый FixedUpdate, когда шарик хочет двигаться в направлении dir.</summary>
        public void Steer(BallController ball, int dir, float speedMul)
        {
            ball.SpeedMul = speedMul;
            if (!ball.Grounded) return;
            var pos = (Vector2)ball.transform.position;
            var c = StandCell(pos);
            int nx = c.x + dir;

            // опасность впереди (включённые ловушки) — притормаживаем
            if (!IgnoreDanger && DangerAhead(pos, dir))
            {
                ball.MoveInput = 0;
                LastObstacle = "опасность";
                return;
            }
            ball.MoveInput = dir;

            bool wall = _g.IsSolid(nx, c.y);
            bool pit = !_g.IsSupport(nx, c.y - 1) && !_g.HasFloorBelow(nx, c.y, out _);

            // на грибе-батуте: высокая стена в 2–3 клетках — прыгаем с гриба заранее
            if (_g.Data.At(c.x, c.y - 1) == 'O' && !wall)
            {
                for (int k = 2; k <= 3; k++)
                {
                    int x2 = c.x + dir * k;
                    if (!(_g.IsSolid(x2, c.y) && _g.IsSolid(x2, c.y + 3))) continue;
                    if (TryAimedJump(ball, pos, c, dir, out float mvx, out float mpw, 3)) { ball.Jump(mvx, mpw); return; }
                    break;
                }
            }
            bool lowStep = !wall && !_g.IsSupport(nx, c.y - 1) && _g.HasFloorBelow(nx, c.y, out int fy) && c.y - fy >= 1;
            if (!(wall || pit))
            {
                LastObstacle = lowStep ? "спуск" : "";
                return;      // просто катимся (вниз со ступенек — тоже просто катимся)
            }
            LastObstacle = wall ? "стена" : "яма";

            float edgeDist = dir > 0 ? (c.x + 1) - pos.x : pos.x - c.x;
            // вплотную к стене с места не запрыгнуть — отступаем на полшага (мини-разбег)
            if (wall && edgeDist < Tuning.BallRadius + 0.15f)
            {
                ball.MoveInput = -dir * 0.6f;
                LastObstacle = "разбег";
                return;
            }
            // у стены прыгаем сразу, у ямы — у самого края (импульсивный прыгает раньше)
            float trigger = wall ? 0.75f : Mathf.Lerp(0.35f, 0.75f, Impulsivity * Random.value);
            if (edgeDist > trigger && !wall) return;

            if (TryAimedJump(ball, pos, c, dir, out float vx, out float power))
            {
                // ошибка «на глаз»: чем импульсивнее, тем сильнее промах
                float err = 1f + Gaussian() * 0.12f * Impulsivity;
                ball.Jump(vx * err, power);
            }
            else if (wall)
            {
                ball.Jump(dir * Tuning.RunSpeed * 0.5f);   // не знаем как — прыгаем в стену (смешно)
            }
            else if (!IgnoreDanger)
            {
                ball.MoveInput = 0;                         // яма, а куда прыгать — непонятно: мнёмся у края
                LastObstacle = "непреодолимая яма";
            }
        }

        /// <summary>Найти ближайшую клетку впереди, куда можно долететь, и нужную горизонтальную скорость.</summary>
        static readonly float[] Powers = { 1f, 0.85f, 0.7f, 0.55f };
        static readonly float[] MushPowers = { 1.45f, 1.25f, 1f, 0.85f, 0.7f, 0.55f };   // Tuning.MushroomPowers + обычные

        public bool TryAimedJump(BallController ball, Vector2 pos, Vector2Int c, int dir, out float vx, out float power, int minDy = -6)
        {
            vx = 0; power = 1f;
            float best = float.MaxValue;
            bool mush = _g.Data.At(c.x, c.y - 1) == 'O';
            var powers = mush ? MushPowers : Powers;
            for (int dx = 1; dx <= 6; dx++)
            for (int dy = mush ? 7 : 3; dy >= minDy; dy--)
            {
                int tx = c.x + dir * dx, ty = c.y + dy;
                if (!_g.IsStandable(tx, ty)) continue;
                if (dx == 1 && dy == 0) continue;
                float h = ty - c.y;                       // перепад высоты в клетках
                // сначала полный прыжок, под низким потолком — слабее
                for (int k = 0; k < powers.Length; k++)
                {
                    float v0 = Tuning.JumpSpeed * powers[k];
                    float disc = v0 * v0 - 2f * G * (h + 0.15f);
                    if (disc < 0) break;
                    float t = (v0 + Mathf.Sqrt(disc)) / G;   // время до приземления (нисходящая ветвь)
                    float needVx = ((tx + 0.5f) - pos.x) / t;
                    if (Mathf.Abs(needVx) > Tuning.RunSpeed * 1.15f) continue;
                    if (!ArcClear(pos, needVx, v0, t)) continue;
                    // предпочитаем ближние и не слишком низкие клетки
                    float score = dx * 1.0f + Mathf.Max(0, -dy) * 0.6f - Mathf.Max(0, dy) * 0.2f + k * 0.3f;
                    if (score < best) { best = score; vx = needVx; power = powers[k]; }
                    break;
                }
            }
            return best < float.MaxValue;
        }

        bool ArcClear(Vector2 p0, float vx, float v0, float tEnd)
        {
            for (float t = 0.05f; t < tEnd - 0.05f; t += 0.05f)
            {
                var p = p0 + new Vector2(vx * t, v0 * t - 0.5f * G * t * t);
                var cell = LevelGrid.Cell(p);
                if (_g.IsSolid(cell.x, cell.y)) return false;
                var top = LevelGrid.Cell(p + Vector2.up * Tuning.BallRadius * 0.8f);
                if (_g.IsSolid(top.x, top.y)) return false;
            }
            return true;
        }

        public bool DangerAhead(Vector2 pos, int dir)
        {
            var gm = GameManager.I;
            if (gm == null || gm.Level == null) return false;
            foreach (var t in gm.Level.Traps)
            {
                if (!t.IsDangerous) continue;
                float dx = (t.Center.x - pos.x) * dir;
                if (t is CrusherTrap)
                {
                    if (dx > -0.6f && dx < 1.8f) return true;
                }
                else if (dx > 0.2f && dx < 2.2f && Mathf.Abs(t.Center.y - pos.y) < 3f) return true;
            }
            return false;
        }

        /// <summary>Текстовое описание окружения — «органы чувств» для нейросети.</summary>
        public string Describe(Vector2 pos, int dir)
        {
            var c = StandCell(pos);
            var sb = new System.Text.StringBuilder();
            int gap = 0, maxRise = 0, maxDrop = 0;
            bool wall = false;
            for (int dx = 1; dx <= 6; dx++)
            {
                int x = c.x + dir * dx;
                if (_g.IsSolid(x, c.y)) { wall = true; int h = 0; while (_g.IsSolid(x, c.y + h) && h < 8) h++; maxRise = Mathf.Max(maxRise, h); break; }
                if (!_g.IsSupport(x, c.y - 1))
                {
                    if (_g.HasFloorBelow(x, c.y, out int fy)) maxDrop = Mathf.Max(maxDrop, c.y - fy);
                    else gap++;
                }
            }
            if (gap > 0) sb.Append($"впереди бездонная яма шириной {gap} кл.; ");
            if (wall) sb.Append($"впереди стена высотой {maxRise} кл.{(maxRise > 3 ? " (не перепрыгнуть с места!)" : "")}; ");
            if (maxDrop > 0) sb.Append($"впереди спуск на {maxDrop} кл.{(maxDrop >= 5 ? " (можно разбиться в лепёшку)" : "")}; ");
            if (sb.Length == 0) sb.Append("впереди ровно; ");
            return sb.ToString();
        }

        static float Gaussian()
        {
            float u1 = 1f - Random.value, u2 = Random.value;
            return Mathf.Sqrt(-2f * Mathf.Log(u1)) * Mathf.Sin(2f * Mathf.PI * u2);
        }
    }
}
