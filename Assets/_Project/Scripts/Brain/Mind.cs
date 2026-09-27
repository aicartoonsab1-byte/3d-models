using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace Sharik
{
    /// <summary>
    /// Психика шарика — то, что делает его развивающимся персонажем, а не автоматом с фразами:
    /// черты характера, свои имена для вещей, убеждения, вопросы, дневник, счёт бед.
    /// Хранится в &lt;persistentDataPath&gt;/sharik_mind.json и переживает уровни, перезапуски и циклы игры.
    /// Тот же смысл, что у Tools/web/mind.js (браузерная версия).
    /// </summary>
    [Serializable]
    public class Mind
    {
        [Serializable] public class Traits { public float curiosity = 0.8f, courage = 0.35f, trust = 0.6f, humor = 0.7f, awareness; }
        [Serializable] public class NamePair { public string key, name; }
        [Serializable] public class DiaryEntry { public string level, text; }
        [Serializable] public class Stats { public int splats, deaths, crushed, spikes, pits, trapsNear, fragments, levelsDone, inspected, thoughts; }

        public Traits traits = new Traits();
        public List<NamePair> names = new List<NamePair>();
        public List<string> beliefs = new List<string>();
        public List<string> questions = new List<string>();
        public List<DiaryEntry> diary = new List<DiaryEntry>();
        public Stats stats = new Stats();
        public int loops;

        // ------------------------------------------------------------------ хранение
        static string PathFile => System.IO.Path.Combine(Application.persistentDataPath, "sharik_mind.json");
        static Mind _i;
        public static Mind I => _i ?? (_i = Load());

        static Mind Load()
        {
            try { if (File.Exists(PathFile)) return JsonUtility.FromJson<Mind>(File.ReadAllText(PathFile)) ?? new Mind(); }
            catch (Exception e) { Debug.LogWarning("[Шарик] Память не прочиталась: " + e.Message); }
            return new Mind();
        }

        public void Save()
        {
            try { File.WriteAllText(PathFile, JsonUtility.ToJson(this, true)); }
            catch (Exception e) { Debug.LogWarning("[Шарик] Память не сохранилась: " + e.Message); }
        }

        public static void Forget() { _i = new Mind(); _i.Save(); }

        // ------------------------------------------------------------------ изменение
        public void Shift(string trait, float d)
        {
            switch (trait)
            {
                case "curiosity": traits.curiosity = Mathf.Clamp01(traits.curiosity + d); break;
                case "courage": traits.courage = Mathf.Clamp01(traits.courage + d); break;
                case "trust": traits.trust = Mathf.Clamp01(traits.trust + d); break;
                case "humor": traits.humor = Mathf.Clamp01(traits.humor + d); break;
                case "awareness": traits.awareness = Mathf.Clamp(traits.awareness + d * 5f, 0f, 5f); break;
            }
        }

        public static bool AddUnique(List<string> list, string text, int max)
        {
            text = (text ?? "").Trim();
            if (text.Length == 0 || text.Length > 140 || list.Contains(text)) return false;
            list.Add(text);
            while (list.Count > max) list.RemoveAt(0);
            return true;
        }

        public string NameOf(string key) => names.FirstOrDefault(n => n.key == key)?.name;

        public void SetName(string key, string name)
        {
            if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(name) || name.Length > 30) return;
            var e = names.FirstOrDefault(n => n.key == key);
            if (e != null) e.name = name; else names.Add(new NamePair { key = key, name = name });
        }

        /// <summary>Стадия прозрения: не ниже сюжетной для уровня, но психика может «обогнать» сюжет.</summary>
        public int Stage(int levelAwareness) => Mathf.Max(levelAwareness, Mathf.Min(5, Mathf.FloorToInt(traits.awareness)));

        // ------------------------------------------------------------------ словарь вещей
        public static readonly Dictionary<string, string> Kind = new Dictionary<string, string>
        {
            { "deco_0", "гриб с полумесяцем на шляпке" }, { "deco_1", "маленький рогатый зверёк" }, { "deco_2", "цветок с глазом" },
            { "deco_3", "улитка со спиралью" }, { "spikes", "шипы" }, { "crusher", "пресс (железная коробка на цепи)" },
            { "trapdoor", "люк в полу" }, { "fan", "вентилятор" }, { "spring", "пружина" }, { "stag", "Лунный Олень" },
            { "watcher", "Всевидящий" }, { "worm", "Кодовый Червь" }, { "keeper", "Хранитель" }, { "exit", "дверь-выход" },
            { "checkpoint", "тотем-флажок" }, { "fragment", "светящийся осколок" }, { "portal", "портал — дыра в мире" },
            { "mushroom", "гриб-батут" },
        };
        public static string What(string key) => Kind.TryGetValue(key, out var w) ? w : key;

        // ------------------------------------------------------------------ офлайн-разум (если нейросеть не запущена)
        static readonly Dictionary<string, string[]> KindNames = new Dictionary<string, string[]>
        {
            { "deco_0", new[] { "Геннадий-гриб", "Лунная Шапка" } }, { "deco_1", new[] { "Рогатик", "Мелкий Бодун" } },
            { "deco_2", new[] { "Мистер Глаз", "Гляделка" } }, { "deco_3", new[] { "Старушка Спираль", "Улиткин" } },
            { "spikes", new[] { "Колючкин", "Бубубу" } }, { "crusher", new[] { "Господин Железяка", "Дядя Бум" } },
            { "trapdoor", new[] { "Ваше Величество Люк", "Дырка" } }, { "fan", new[] { "Дядя Ветер", "Дуйчик" } },
            { "spring", new[] { "Прыгун Прыгунович", "Боинг" } }, { "mushroom", new[] { "Батутыч", "Пружинный Гриб" } },
            { "portal", new[] { "Дырка-в-Мире", "Кроличья Нора" } }, { "stag", new[] { "Бог Невезения", "Луноголовый" } },
            { "watcher", new[] { "Тот-Кто-Смотрит", "Глазастик" } }, { "worm", new[] { "Баг", "Подземный Дед" } },
            { "keeper", new[] { "Сторож", "Большой Звёздный" } },
        };
        static readonly string[][] Questions =
        {
            new[] { "Почему небо не падает?", "Кто придумал слово «яма»?", "У травы есть мама?" },
            new[] { "Почему беды любят именно меня?", "Можно ли договориться с удачей?", "Если я перепрыгну — это подвиг?" },
            new[] { "Зачем я появился?", "Почему всё вокруг квадратное?", "Мир красивый или злой — или оба?" },
            new[] { "Кто нажимает ловушки?", "Почему всё срабатывает, когда я рядом?", "Эта стрелочка — это глаз?" },
            new[] { "Я настоящий или меня нарисовали?", "Что будет за краем экрана?", "Зачем матрице лепёшки?" },
            new[] { "Что за рубильником?", "Если выключить мир, останусь ли я?", "Будет ли наблюдателю грустно?" },
        };
        static readonly (Func<Mind, bool> need, string text)[] Beliefs =
        {
            (m => m.stats.splats >= 3, "Пол всегда твёрже, чем кажется."),
            (m => m.stats.trapsNear >= 3, "Ловушки просыпаются, когда я рядом."),
            (m => m.stats.trapsNear >= 8, "Кто-то включает ловушки нарочно. Кто-то смотрит."),
            (m => m.stats.fragments >= 2, "Мир написан буквами. Я нахожу обрывки."),
            (m => m.stats.deaths >= 2, "Я не умираю по-настоящему — меня собирают обратно."),
            (m => m.stats.levelsDone >= 3, "За каждой дверью — ещё одна дверь."),
            (m => m.traits.awareness >= 3.5f, "Этот мир — программа. А я в ней — ошибка, которая думает."),
        };

        /// <summary>Мысль без нейросети — но с памятью: имена, счёт бед, убеждения, вопросы, черты.</summary>
        public BrainReply OfflineThought(List<Perception.Thing> seen, int stage, PhraseBank bank)
        {
            var rnd = new System.Random();
            var unnamed = seen.FirstOrDefault(t => NameOf(t.Key) == null && t.Key != "exit" && t.Key != "checkpoint" && t.Key != "fragment");
            if (unnamed != null && rnd.NextDouble() < 0.5 + traits.curiosity * 0.4)
            {
                var used = names.Select(n => n.name).ToHashSet();
                var pool = (KindNames.TryGetValue(unnamed.Key, out var own) ? own : new string[0])
                    .Concat(new[] { "Геннадий", "Тётя Плюх", "Шуршик", "Бубубу", "Тыкалка" }).Where(n => !used.Contains(n)).ToList();
                string nm = pool.Count > 0 ? pool[rnd.Next(pool.Count)] : "Штука";
                SetName(unnamed.Key, nm);
                Save();
                return new BrainReply { say = $"Ты — {unnamed.What}? Нет. Ты — {nm}. Я так решил.", mood = "happy", intensity = 0.6f,
                    action = Mathf.Abs(unnamed.Dx) < 5 ? "inspect" : "forward", target = unnamed.Id };
            }
            var lines = new List<(string, string)>();
            var named = seen.FirstOrDefault(t => NameOf(t.Key) != null);
            if (named != null) lines.Add(($"{NameOf(named.Key)}, это снова ты? Я тебя помню.", "suspicious"));
            if (stats.splats > 1) lines.Add(($"Это была моя {stats.splats}-я лепёшка. Я начинаю различать полы на вкус.", "sad"));
            if (beliefs.Count > 0) lines.Add(($"Я знаю точно: {beliefs[beliefs.Count - 1].ToLower()}", stage >= 3 ? "suspicious" : "determined"));
            if (questions.Count > 0) lines.Add(($"Всё думаю: {questions[0].ToLower()}", "awe"));
            if (traits.courage < 0.25f) lines.Add(("Мне страшно. Но я всё равно покачусь. Чуть-чуть. Медленно.", "scared"));
            if (traits.courage > 0.7f) lines.Add(("Я уже ничего не боюсь. Кроме пола. И прессов. Ну, почти ничего.", "determined"));
            if (traits.trust < 0.3f && stage >= 3) lines.Add(("Я тебе больше не верю, наблюдатель. Ну, может, капельку.", "angry"));
            if (bank.Pick("idle", stage, out var l, out var md)) lines.Add((l, md));
            if (rnd.NextDouble() < 0.3) AddUnique(questions, Questions[Mathf.Min(5, stage)][rnd.Next(3)], 5);
            foreach (var b in Beliefs)
                if (b.need(this) && AddUnique(beliefs, b.text, 8))
                {
                    Save();
                    return new BrainReply { thought = "Кажется, я понял: " + b.text, mood = "awe", intensity = 0.8f, action = "wait" };
                }
            Save();
            var pick = lines.Count > 0 ? lines[rnd.Next(lines.Count)] : ("...", "neutral");
            return rnd.NextDouble() < 0.5
                ? new BrainReply { say = pick.Item1, mood = pick.Item2, intensity = 0.5f, action = "forward" }
                : new BrainReply { thought = pick.Item1, mood = pick.Item2, intensity = 0.5f, action = "forward" };
        }
    }
}
