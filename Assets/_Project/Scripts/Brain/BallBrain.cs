using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Sharik
{
    /// <summary>
    /// Мозг шарика. Три слоя:
    ///  • психика (Mind) — черты, имена, убеждения, вопросы, дневник; переживает уровни и циклы;
    ///  • разум (нейросеть, OpenAI-совместимый API / Ollama) — думает ПО СОБЫТИЯМ: новое, беда, находка,
    ///    клик наблюдателя, застревание, затишье. Отвечает мыслью, репликой, эмоцией с силой, действием,
    ///    а ещё даёт имена, меняет убеждения и черты — так шарик развивается;
    ///  • инстинкт (Navigator) — каждый кадр: как катиться и прыгать.
    /// Без нейросети работает офлайн-разум Mind.OfflineThought (тоже с памятью).
    /// </summary>
    public class BallBrain : MonoBehaviour
    {
        public enum Intent { Forward, Back, Wait, Yolo, Pray, Look, Inspect }

        public Intent Current = Intent.Forward;
        public int Awareness;
        public string Status = "";

        BallController _ball;
        Navigator _nav;
        LevelRuntime _lv;
        BrainConfig _cfg;
        LlmClient _llm;
        PhraseBank _bank;
        IVoice _voice;
        ThoughtBubble _bubble;

        float _intentUntil;
        bool _scriptedBusy, _introPending, _wantThink, _thinking, _jumpNow;
        float _lastCall = -99f, _lastEvent, _nextQuiet;
        readonly Queue<(string text, string mood, bool thought)> _script = new Queue<(string, string, bool)>();
        readonly HashSet<int> _linesDone = new HashSet<int>();
        readonly List<string> _events = new List<string>();
        readonly List<string> _levelLog = new List<string>();
        readonly List<string> _recentSays = new List<string>();
        readonly HashSet<string> _seenKinds = new HashSet<string>();
        readonly Dictionary<int, int> _deathsAt = new Dictionary<int, int>();
        float _stuckRefX, _stuckSince;
        int _stuckTries;
        bool _cursorNoticed;
        Perception.Thing _inspect;
        float _inspectUntil;
        bool _inspectArrived;

        const float MinGap = 5f;     // локальная нейросеть бесплатна — но и болтать без умолку не надо

        public LlmClient Llm => _llm;
        public bool Busy => _scriptedBusy || _bubble.SpeechBusy;

        public void Init(BallController ball, LevelRuntime lv, BrainConfig cfg, LlmClient llm, PhraseBank bank,
            IVoice voice, ThoughtBubble bubble)
        {
            _ball = ball; _lv = lv; _cfg = cfg; _llm = llm; _bank = bank; _voice = voice; _bubble = bubble;
            _nav = new Navigator(lv.Grid);
            var m = Mind.I;
            m.traits.awareness = Mathf.Max(m.traits.awareness, lv.Data.awareness);
            Awareness = m.Stage(lv.Data.awareness);
            _nav.Impulsivity = Mathf.Clamp01(0.85f - m.traits.courage * 0.3f - Awareness * 0.06f);
            _stuckRefX = ball.transform.position.x;
            _stuckSince = _lastEvent = Time.time;
            _nextQuiet = Time.time + 14f;

            GameEvents.BallSplat += OnSplat;
            GameEvents.BallReformed += OnReformed;
            GameEvents.TrapFired += OnTrap;
            GameEvents.FragmentFound += OnFragment;
            GameEvents.CheckpointReached += OnCheckpoint;
            GameEvents.BallJumped += OnJumped;
            GameEvents.World += OnWorld;

            foreach (var line in lv.Data.intro) Enqueue(line, Awareness >= 4 ? "glitch" : "neutral", false);
            _introPending = _script.Count > 0;
            Event("Начался новый уровень. Ты осматриваешься.", true);
            Status = _cfg.useLlm ? "разум: нейросеть" : "разум: офлайн";
        }

        void OnDestroy()
        {
            GameEvents.BallSplat -= OnSplat;
            GameEvents.BallReformed -= OnReformed;
            GameEvents.TrapFired -= OnTrap;
            GameEvents.FragmentFound -= OnFragment;
            GameEvents.CheckpointReached -= OnCheckpoint;
            GameEvents.BallJumped -= OnJumped;
            GameEvents.World -= OnWorld;
        }

        // ================================================================ речь
        public void Enqueue(string text, string mood, bool thought)
        {
            if (!string.IsNullOrEmpty(text)) _script.Enqueue((text, mood, thought));
        }

        public IEnumerator SayAndWait(string text, string mood)
        {
            Speak(text, mood, false, 0.6f);
            yield return null;
            while (_bubble.SpeechBusy) yield return null;
        }

        void Speak(string text, string mood, bool thought, float k = 0.5f)
        {
            if (string.IsNullOrEmpty(text)) return;
            _ball.Visual.SetMood(mood, 3f);
            if (thought) _bubble.Think(text);
            else
            {
                _bubble.Say(text, k);
                _voice?.Speak(text, mood);
                _recentSays.Add(text);
                if (_recentSays.Count > 6) _recentSays.RemoveAt(0);
                _levelLog.Add("сказал: " + text);
            }
        }

        bool React(string key, float chance = 1f)
        {
            if (Random.value > chance || _bubble.SpeechBusy) return false;
            if (_bank.Pick(key, Awareness, out var line, out var mood)) { Speak(line, mood, false); return true; }
            return false;
        }

        /// <summary>Событие для разума. Важные — повод подумать.</summary>
        void Event(string what, bool important = false)
        {
            _events.Add(what);
            if (_events.Count > 6) _events.RemoveAt(0);
            _levelLog.Add(what);
            _lastEvent = Time.time;
            if (important) _wantThink = true;
        }

        // ================================================================ события мира
        void OnSplat(DeathKind kind, bool died)
        {
            var m = Mind.I;
            m.stats.splats++;
            if (died) m.stats.deaths++;
            if (kind == DeathKind.Crushed) m.stats.crushed++;
            if (kind == DeathKind.Spikes) m.stats.spikes++;
            if (kind == DeathKind.Pit) m.stats.pits++;
            m.Shift("courage", died ? -0.05f : -0.03f);
            m.Save();
            switch (kind)
            {
                case DeathKind.Crushed: React("crushed"); Event("Тебя расплющило прессом в лепёшку.", true); break;
                case DeathKind.Spikes: React("spikes"); Event("Ты наткнулся на шипы и погиб, тебя собрали на флажке.", true); break;
                case DeathKind.Pit: React("pit"); Event("Ты упал в бездонную яму, тебя собрали обратно.", true); break;
                default: React("splat_land"); Event("Ты шмякнулся с высоты и стал лепёшкой.", true); break;
            }
            _ball.Visual.Emote(kind == DeathKind.Pit ? "scared" : "dizzy", 0.8f);
            if (died)
            {
                int cell = Mathf.FloorToInt(_ball.transform.position.x) / 4;
                _deathsAt.TryGetValue(cell, out int n);
                _deathsAt[cell] = n + 1;
                if (n + 1 >= 2) _nav.Impulsivity = Mathf.Max(0.05f, _nav.Impulsivity * 0.6f);   // учится
            }
        }

        void OnReformed()
        {
            if (Random.value < 0.4f) React("respawn");
            Current = Intent.Forward;
            _inspect = null;
            _stuckSince = Time.time;
            _stuckRefX = _ball.transform.position.x;
        }

        void OnTrap(TrapBase t)
        {
            if (Vector2.Distance(t.Center, _ball.transform.position) > 8f) return;
            var m = Mind.I;
            m.stats.trapsNear++;
            m.Shift("trust", -0.02f);
            m.Shift("awareness", 0.006f);
            m.Save();
            if (!React("trap_fired", Mathf.Lerp(0.25f, 0.65f, Awareness / 5f)))
                _ball.Visual.SetMood(Awareness >= 3 ? "suspicious" : "scared", 1.5f);
            if (Awareness >= 3) _ball.Visual.LookAt(t.Center);
            Event($"{t.Title.ToLower()} сработал(а) сам(а) по себе рядом с тобой.", m.stats.trapsNear % 2 == 1);
        }

        void OnFragment(string text)
        {
            var m = Mind.I;
            m.stats.fragments++;
            m.Shift("awareness", 0.03f);
            m.Shift("curiosity", 0.03f);
            m.Save();
            Enqueue(text, "awe", false);
            Event("Ты нашёл светящийся осколок, в нём написано: " + text, true);
        }

        void OnCheckpoint(Vector2 p) { React("checkpoint", 0.5f); Event("Ты дотронулся до тотема-флажка, он загорелся."); }
        void OnJumped() { React("jump", 0.04f); }
        void OnWorld(string what) { Event(what, true); }

        // ================================================================ цикл
        void Update()
        {
            if (_ball == null || _lv == null) return;
            var pos = (Vector2)_ball.transform.position;

            if (_bubble.ReadyForNext && _script.Count > 0)
            {
                var s = _script.Dequeue();
                Speak(s.text, s.mood, s.thought);
                _scriptedBusy = true;
            }
            else if (_script.Count == 0 && !_bubble.SpeechBusy) _scriptedBusy = false;

            Awareness = Mind.I.Stage(_lv.Data.awareness);
            if (!_ball.IsAlive) return;

            var lines = _lv.Data.lines;
            for (int i = 0; i < lines.Length; i++)
                if (!_linesDone.Contains(i) && pos.x >= lines[i].x)
                {
                    _linesDone.Add(i);
                    Enqueue(lines[i].text, lines[i].mood, false);
                    Event("Ты подумал вслух: " + lines[i].text);
                }

            // новое в поле зрения — повод для любопытства
            foreach (var th in Perception.See(_lv, pos))
            {
                if (_seenKinds.Contains(th.Key) || Mathf.Abs(th.Dx) > 7f) continue;
                _seenKinds.Add(th.Key);
                string nm = Mind.I.NameOf(th.Key);
                if (th.Key == "stag" || th.Key == "watcher" || th.Key == "worm" || th.Key == "keeper")
                {
                    _ball.Visual.LookAt(th.Pos);
                    React("boss_seen");
                    _ball.Visual.Emote("awe", 0.8f);
                }
                Event($"Ты впервые на этом уровне видишь: {th.What}{(nm != null ? $" (ты зовёшь его «{nm}»)" : "")}.",
                    th.Key != "checkpoint" && th.Key != "exit");
            }

            CheckCursor(pos);
            CheckStuck(pos);
            if (Time.time >= _intentUntil && Current != Intent.Forward && Current != Intent.Inspect) Current = Intent.Forward;

            if (Time.time - _lastEvent > 16f && Time.time > _nextQuiet)
            {
                _nextQuiet = Time.time + 20f;
                Event("Уже какое-то время ничего не происходит. Можно подумать о жизни.", true);
            }
            bool free = !_introPending && !_scriptedBusy && _script.Count == 0 && _bubble.ReadyForNext;
            if (_wantThink && free && !_thinking && Time.time - _lastCall > MinGap) StartCoroutine(Think());
        }

        void FixedUpdate()
        {
            if (_ball == null || !_ball.IsAlive) return;
            int dir = _lv.Goal.x >= _ball.transform.position.x ? 1 : -1;
            _nav.IgnoreDanger = false;
            if (_introPending)
            {
                if (_script.Count == 0 && !_bubble.SpeechBusy) _introPending = false;
                else { _ball.MoveInput = 0; return; }
            }
            if (_jumpNow && _ball.Grounded)
            {
                _jumpNow = false;
                var c = _nav.StandCell(_ball.transform.position);
                if (_nav.TryAimedJump(_ball, _ball.transform.position, c, dir, out float vx, out float pw)) _ball.Jump(vx, pw);
                else _ball.Jump(dir * 2f, 0.7f);
            }
            if (Current == Intent.Inspect && _inspect != null)
            {
                float dx = _inspect.Pos.x - _ball.transform.position.x;
                if (!_inspectArrived && Mathf.Abs(dx) > 0.9f && Time.time < _inspectUntil) { _nav.Steer(_ball, dx > 0 ? 1 : -1, Tuning.WalkMul); return; }
                if (!_inspectArrived)
                {
                    _inspectArrived = true;
                    _inspectUntil = Time.time + 2.5f;
                    _ball.Visual.LookAt(_inspect.Pos);
                    var m = Mind.I; m.stats.inspected++; m.Shift("curiosity", 0.02f); m.Save();
                    _ball.Visual.Emote("awe", 0.5f);
                    string nm = m.NameOf(_inspect.Key);
                    Event($"Ты подкатился и внимательно разглядываешь: {_inspect.What}{(nm != null ? $" («{nm}»)" : "")}. Что ты замечаешь? Что это значит для тебя?", true);
                }
                _ball.MoveInput = 0;
                if (Time.time > _inspectUntil) { _inspect = null; Current = Intent.Forward; _ball.Visual.LookAt(null); }
                return;
            }
            float courage = 0.8f + Mind.I.traits.courage * 0.4f;             // смелый катится бодрее
            float walk = (_scriptedBusy && _bubble.SpeechBusy ? Tuning.WalkTalkMul : Tuning.WalkMul) * courage;
            switch (Current)
            {
                case Intent.Forward: _nav.Steer(_ball, dir, walk); break;
                case Intent.Back: _nav.Steer(_ball, -dir, Tuning.BackMul); break;
                case Intent.Yolo: _nav.IgnoreDanger = true; _nav.Steer(_ball, dir, Tuning.YoloMul); break;
                default: _ball.MoveInput = 0; break;
            }
        }

        void SetIntent(Intent i, float duration)
        {
            Current = i;
            _intentUntil = Time.time + duration;
            if (i == Intent.Pray) _ball.Visual.SetMood("pray", duration);
            if (i == Intent.Look) StartCoroutine(LookAround(duration));
        }

        IEnumerator LookAround(float d)
        {
            var p = (Vector2)_ball.transform.position;
            _ball.Visual.LookAt(p + Vector2.left);
            yield return new WaitForSeconds(d / 2);
            _ball.Visual.LookAt(p + Vector2.right);
            yield return new WaitForSeconds(d / 2);
            _ball.Visual.LookAt(null);
        }

        void CheckStuck(Vector2 pos)
        {
            if (_introPending || Current == Intent.Inspect || (Current != Intent.Forward && Current != Intent.Yolo))
            {
                _stuckSince = Time.time; _stuckRefX = pos.x; return;
            }
            if (Mathf.Abs(pos.x - _stuckRefX) > 1.2f) { _stuckRefX = pos.x; _stuckSince = Time.time; _stuckTries = 0; return; }
            if (Time.time - _stuckSince > Tuning.StuckSeconds)
            {
                _stuckTries++;
                _stuckSince = Time.time;
                React("stuck", 0.6f);
                Event("Ты застрял и уже несколько секунд не можешь пройти дальше.", true);
                if (_stuckTries % 3 == 1) SetIntent(Intent.Back, 0.8f);
                else if (_stuckTries % 3 == 2) SetIntent(Intent.Yolo, 3f);
                else SetIntent(Intent.Pray, 2f);
            }
        }

        void CheckCursor(Vector2 pos)
        {
            if (Awareness < 3 || Camera.main == null) return;
            Vector2 mouse = Camera.main.ScreenToWorldPoint(InputShim.MousePos());
            if (Vector2.Distance(mouse, pos) < 1.6f)
            {
                _ball.Visual.LookAt(mouse);
                if (!_cursorNoticed)
                {
                    _cursorNoticed = true;
                    React("cursor");
                    Event("Рядом с тобой странная стрелочка (курсор наблюдателя). Она двигается.", true);
                }
            }
            else if (Awareness >= 4 && Random.value < 0.002f) _ball.Visual.LookAt(mouse);
        }

        // ================================================================ мышление
        IEnumerator Think()
        {
            _thinking = true;
            _wantThink = false;
            _lastCall = Time.time;
            var events = new List<string>(_events);
            _events.Clear();
            if (events.Count == 0) events.Add("Ничего не происходит. Тишина.");
            var pos = (Vector2)_ball.transform.position;
            BrainReply reply = null;
            if (_llm.CanAsk)
            {
                _bubble.ShowThinking(true);
                yield return _llm.Ask(BrainPrompt.System(), BrainPrompt.User(_lv, _nav, pos, Awareness, events, _recentSays),
                    content => reply = BrainReply.Parse(content));
                _bubble.ShowThinking(false);
                Status = reply != null ? $"разум: {_cfg.model}" : "разум: офлайн (нейросеть молчит)";
            }
            if (reply == null) reply = Mind.I.OfflineThought(Perception.See(_lv, pos), Awareness, _bank);
            Mind.I.stats.thoughts++;
            _thinking = false;
            if (_ball == null || !_ball.IsAlive) yield break;
            Apply(reply, pos);
        }

        static readonly HashSet<string> Moods = new HashSet<string>
            { "neutral", "happy", "scared", "angry", "sad", "awe", "pray", "dizzy", "suspicious", "determined", "glitch" };

        void Apply(BrainReply r, Vector2 pos)
        {
            var m = Mind.I;
            var seen = Perception.See(_lv, pos);
            string mood = Moods.Contains((r.mood ?? "").Trim().ToLower()) ? r.mood.Trim().ToLower() : "neutral";
            float k = Mathf.Clamp01(r.intensity);
            if (r.name != null && !string.IsNullOrEmpty(r.name.thing) && !string.IsNullOrEmpty(r.name.@as))
            {
                var th = seen.FirstOrDefault(t => t.Id == r.name.thing) ?? seen.FirstOrDefault(t => t.Key == r.name.thing);
                if (th != null) m.SetName(th.Key, r.name.@as);
            }
            if (!string.IsNullOrEmpty(r.belief)) Mind.AddUnique(m.beliefs, r.belief, 8);
            if (!string.IsNullOrEmpty(r.answered)) m.questions.Remove(r.answered);
            if (!string.IsNullOrEmpty(r.question)) Mind.AddUnique(m.questions, r.question, 5);
            if (r.traits != null)
            {
                m.Shift("curiosity", Mathf.Clamp(r.traits.curiosity, -0.1f, 0.1f));
                m.Shift("courage", Mathf.Clamp(r.traits.courage, -0.1f, 0.1f));
                m.Shift("trust", Mathf.Clamp(r.traits.trust, -0.1f, 0.1f));
                m.Shift("awareness", Mathf.Clamp(r.traits.awareness, -0.1f, 0.1f));
            }
            m.Save();

            _ball.Visual.Emote(mood, k);
            string say = Clip(r.say);
            if (say.Length > 0 && k > 0.8f && (mood == "angry" || mood == "scared")) say = say.ToUpper();   // кричит
            if (Clip(r.thought).Length > 0) Speak(Clip(r.thought), mood, true, k);
            if (say.Length > 0) Speak(say, mood, false, k);

            switch ((r.action ?? "forward").Trim().ToLower())
            {
                case "inspect":
                    var th = seen.FirstOrDefault(t => t.Id == r.target) ?? seen.FirstOrDefault(t => m.NameOf(t.Key) == null);
                    if (th != null && Mathf.Abs(th.Dx) < 8f)
                    {
                        _inspect = th; _inspectArrived = false; _inspectUntil = Time.time + 7f;
                        Current = Intent.Inspect;
                    }
                    break;
                case "back": SetIntent(Intent.Back, 1.2f); break;
                case "wait": SetIntent(Intent.Wait, 2.2f); break;
                case "jump": _jumpNow = true; break;
                case "yolo": SetIntent(Intent.Yolo, 2.5f); break;
                case "pray": SetIntent(Intent.Pray, 2.2f); break;
                case "look": SetIntent(Intent.Look, 1.6f); break;
                default: if (Current != Intent.Inspect) SetIntent(Intent.Forward, 0f); break;
            }
        }

        static string Clip(string s)
        {
            s = (s ?? "").Trim();
            return s.Length > 140 ? s.Substring(0, 137) + "..." : s;
        }

        // ================================================================ дневник уровня
        /// <summary>Рефлексия после уровня: запись в дневник, пересмотр убеждений и вопросов. Запускать на GameManager.</summary>
        public IEnumerator Reflect()
        {
            var m = Mind.I;
            m.stats.levelsDone++;
            m.Shift("courage", 0.05f);
            string title = _lv.Data.title;
            var log = _levelLog.Skip(Mathf.Max(0, _levelLog.Count - 8)).ToList();
            ReflectionReply rr = null;
            if (_llm.CanAsk)
            {
                yield return _llm.Ask(BrainPrompt.System(), BrainPrompt.Reflection(title, log, Awareness), content =>
                {
                    var json = BrainReply.ExtractJson(content);
                    if (json != null) { try { rr = JsonUtility.FromJson<ReflectionReply>(json); } catch { rr = null; } }
                });
            }
            if (rr != null && !string.IsNullOrEmpty(rr.diary))
            {
                m.diary.Add(new Mind.DiaryEntry { level = title, text = rr.diary.Length > 200 ? rr.diary.Substring(0, 200) : rr.diary });
                if (rr.beliefs != null && rr.beliefs.Length > 0) m.beliefs = rr.beliefs.Where(b => !string.IsNullOrWhiteSpace(b)).Take(8).ToList();
                if (rr.questions != null && rr.questions.Length > 0) m.questions = rr.questions.Where(q => !string.IsNullOrWhiteSpace(q)).Take(5).ToList();
            }
            else
            {
                m.diary.Add(new Mind.DiaryEntry { level = title, text = m.stats.splats > 3
                    ? $"Много падал. {m.stats.splats} лепёшек за жизнь. Но я всё ещё круглый."
                    : "Прошёл. Мир стал чуть понятнее и чуть страшнее." });
            }
            while (m.diary.Count > 12) m.diary.RemoveAt(0);
            m.Save();
        }
    }
}
