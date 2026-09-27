using System.Collections.Generic;
using System.Text;
using UnityEngine;

namespace Sharik
{
    /// <summary>Сборка промпта: характер (persona_ru.txt) + что шарик видит, помнит и чувствует.</summary>
    public static class BrainPrompt
    {
        static string _persona;

        public static string System()
        {
            if (_persona == null)
            {
                var ta = Resources.Load<TextAsset>("Brain/persona_ru");
                _persona = ta != null ? ta.text : "Ты — смешной шарик из пластилина в видеоигре. Отвечай JSON.";
            }
            return _persona;
        }

        public static string User(BallBrain brain, BallController ball, LevelRuntime lv, Navigator nav,
            List<(float time, string text)> memory, List<string> recentSays, int trapsSeen)
        {
            var d = lv.Data;
            var pos = (Vector2)ball.transform.position;
            int dir = lv.Goal.x >= pos.x ? 1 : -1;
            var sb = new StringBuilder();
            sb.AppendLine($"УРОВЕНЬ: «{d.title}». {d.storyBeat}");
            sb.AppendLine($"ТВОЯ СТАДИЯ ПРОЗРЕНИЯ: {brain.Awareness} из 5.");
            int loops = PlayerPrefs.GetInt("sharik_loops", 0);
            if (loops > 0) sb.AppendLine($"СТРАННОЕ ЧУВСТВО: дежавю. Будто ты проходил всё это уже {loops} раз(а).");
            if (BallBrain.Biography.Count > 0)
            {
                sb.AppendLine("ТЫ ПОМНИШЬ ИЗ ПРОШЛОГО:");
                foreach (var b in BallBrain.Biography) sb.AppendLine("- " + b);
            }
            int left = Mathf.Abs(Mathf.RoundToInt(lv.Goal.x - pos.x));
            int pct = Mathf.RoundToInt(100f * Mathf.Clamp01(pos.x / Mathf.Max(1f, lv.Goal.x)));
            sb.AppendLine($"ГДЕ ТЫ: пройдено {pct}% пути, до цели {left} клеток {(dir > 0 ? "вправо" : "влево")}.");
            sb.Append("ЧТО ТЫ ВИДИШЬ: ").Append(nav.Describe(pos, dir));
            foreach (var t in lv.Traps)
            {
                float dx = (t.Center.x - pos.x) * dir;
                if (dx < -2f || dx > 7f || Mathf.Abs(t.Center.y - pos.y) > 6f) continue;
                string where = dx < 0.6f && dx > -0.6f ? "прямо рядом" : dx > 0 ? $"в {Mathf.RoundToInt(dx)} кл. впереди" : "позади";
                sb.Append($"{t.DescribeState()} ({where}); ");
            }
            sb.AppendLine();
            if (memory.Count > 0)
            {
                sb.AppendLine("НЕДАВНО С ТОБОЙ БЫЛО:");
                for (int i = Mathf.Max(0, memory.Count - 6); i < memory.Count; i++)
                    sb.AppendLine($"- {Time.time - memory[i].time:0} с назад: {memory[i].text}");
            }
            sb.AppendLine($"СЧЁТ БЕД НА УРОВНЕ: лепёшек {ball.Splats}, смертей {ball.Deaths}, ловушки «сами» сработали {trapsSeen} раз.");
            if (recentSays.Count > 0) sb.AppendLine("НЕ ПОВТОРЯЙ СВОИ НЕДАВНИЕ ФРАЗЫ: " + string.Join(" | ", recentSays));
            sb.AppendLine("Что ты думаешь, что говоришь и что делаешь? Ответь JSON.");
            return sb.ToString();
        }
    }
}
