using System.Collections.Generic;
using System.Linq;
using System.Text;
using UnityEngine;

namespace Sharik
{
    /// <summary>
    /// Промпт «разума»: характер (persona_ru.txt) + живая психика (Mind) + что видит + что случилось.
    /// Та же схема ответа, что в браузерной версии (Tools/web/mind.js).
    /// </summary>
    public static class BrainPrompt
    {
        static string _persona;

        public static string System()
        {
            if (_persona == null)
            {
                var ta = Resources.Load<TextAsset>("Brain/persona_ru");
                string p = ta != null ? ta.text : "Ты — смешной шарик из пластилина в видеоигре.";
                int cut = p.IndexOf("ДЕЙСТВИЯ", global::System.StringComparison.Ordinal);
                _persona = (cut > 0 ? p.Substring(0, cut) : p).Trim() + "\n\n" + Schema;
            }
            return _persona;
        }

        const string Schema =
@"Думай по-настоящему: будь любопытным (разглядывай новое, давай вещам имена, строй гипотезы о мире), эмоциональным
(сила эмоции 0..1) и развивайся: делай выводы из опыта, меняй убеждения, задавай новые вопросы и отвечай на старые.
Реплики короткие (до 100 символов), живые, смешные и немного грустные. Не повторяйся.

Ответь ТОЛЬКО JSON:
{""thought"":""мысль про себя или пусто"",""say"":""фраза вслух или пусто"",
 ""mood"":""neutral|happy|scared|angry|sad|awe|pray|dizzy|suspicious|determined|glitch"",""intensity"":0.5,
 ""action"":""forward|back|wait|jump|yolo|pray|look|inspect"",""target"":""id вещи для inspect или пусто"",
 ""name"":{""thing"":""id вещи"",""as"":""новое имя или пусто""},
 ""belief"":""новое убеждение или пусто"",""question"":""новый вопрос или пусто"",""answered"":""вопрос, на который ты ответил, или пусто"",
 ""traits"":{""curiosity"":0,""courage"":0,""trust"":0,""awareness"":0}}
(traits — маленькие сдвиги от -0.1 до 0.1: как это событие меняет тебя)";

        public static string User(LevelRuntime lv, Navigator nav, Vector2 pos, int stage, List<string> events, List<string> recentSays)
        {
            var m = Mind.I;
            var d = lv.Data;
            int dir = lv.Goal.x >= pos.x ? 1 : -1;
            var sb = new StringBuilder();
            sb.AppendLine("ТЫ СЕЙЧАС (живая психика, меняется от пережитого):");
            sb.AppendLine($"- стадия прозрения {stage} из 5 (уровень «{d.title}». {d.storyBeat})");
            sb.AppendLine($"- любопытство {m.traits.curiosity:0.00}, смелость {m.traits.courage:0.00}, доверие к «тому, кто смотрит» {m.traits.trust:0.00}, юмор {m.traits.humor:0.00}");
            sb.AppendLine($"- циклов жизни {m.loops}; лепёшек за всё время {m.stats.splats}, смертей {m.stats.deaths}, ловушки «сами» срабатывали рядом {m.stats.trapsNear} раз");
            sb.AppendLine("- твои имена для вещей: " + (m.names.Count > 0 ? string.Join("; ", m.names.Select(n => $"{Mind.What(n.key)} = «{n.name}»")) : "пока никому не дал имён"));
            sb.AppendLine("- во что веришь: " + (m.beliefs.Count > 0 ? string.Join(" | ", m.beliefs) : "пока ни во что уверенно"));
            sb.AppendLine("- что мучает: " + (m.questions.Count > 0 ? string.Join(" | ", m.questions) : "пока ничего"));
            sb.AppendLine("- дневник: " + (m.diary.Count > 0 ? string.Join(" | ", m.diary.Skip(Mathf.Max(0, m.diary.Count - 3)).Select(e => $"«{e.level}»: {e.text}")) : "пусто"));
            int pct = Mathf.RoundToInt(100f * Mathf.Clamp01(pos.x / Mathf.Max(1f, lv.Goal.x)));
            sb.AppendLine($"ЧТО ТЫ ВИДИШЬ: {nav.Describe(pos, dir)} путь пройден на {pct}%.");
            foreach (var t in Perception.See(lv, pos))
            {
                string nm = m.NameOf(t.Key);
                sb.AppendLine($"- [{t.Id}] {t.What}{(nm != null ? $" (ты зовёшь его «{nm}»)" : " (ещё без имени)")}, {(t.Dx > 0 ? "впереди" : "позади")} в {Mathf.Abs(t.Dx)} кл.{(t.State != null ? ", " + t.State : "")}");
            }
            sb.AppendLine("ЧТО СЛУЧИЛОСЬ ТОЛЬКО ЧТО:");
            foreach (var e in events) sb.AppendLine("- " + e);
            if (recentSays.Count > 0) sb.AppendLine("НЕ ПОВТОРЯЙ: " + string.Join(" | ", recentSays));
            sb.AppendLine("Что ты думаешь, говоришь и делаешь? Ответь JSON.");
            return sb.ToString();
        }

        public static string Reflection(string title, List<string> events, int stage)
        {
            var m = Mind.I;
            return $"Ты только что прошёл уровень «{title}». С тобой было: {string.Join(" | ", events)}.\n" +
                   $"Твои убеждения: {string.Join(" | ", m.beliefs)}. Вопросы: {string.Join(" | ", m.questions)}. Стадия прозрения {stage}/5.\n" +
                   "Запиши в дневник 1–2 коротких предложения (как ты изменился), обнови убеждения (до 6) и вопросы (до 4).\n" +
                   "Ответь ТОЛЬКО JSON: {\"diary\":\"...\",\"beliefs\":[\"...\"],\"questions\":[\"...\"]}";
        }
    }
}
