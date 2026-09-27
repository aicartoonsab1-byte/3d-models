using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;

namespace Sharik
{
    /// <summary>
    /// Мозг шарика. Два уровня:
    ///  • медленный — нейросеть (раз в несколько секунд): мысли, реплики, эмоция и НАМЕРЕНИЕ;
    ///  • быстрый — инстинкт (Navigator, каждый кадр): как именно катиться и прыгать.
    /// Плюс сценарные реплики уровня (intro/lines/outro), фрагменты кода и мгновенные реакции из PhraseBank.
    /// </summary>
    public class BallBrain : MonoBehaviour
    {
        public enum Intent { Forward, Back, Wait, Jump, RunJump, Yolo, Pray, Look }

        public Intent Current = Intent.Forward;
        public string LastThought = "", LastSay = "";
        public int Awareness;

        BallController _ball;
        Navigator _nav;
        LevelRuntime _lv;
        BrainConfig _cfg;
        LlmClient _llm;
        PhraseBank _bank;
        IVoice _voice;
        ThoughtBubble _bubble;

        float _intentUntil;
        float _nextThink;
        bool _scriptedBusy;
        readonly Queue<(string text, string mood, bool thought)> _script = new Queue<(string, string, bool)>();
        readonly HashSet<int> _linesDone = new HashSet<int>();
        readonly List<(float time, string text)> _memory = new List<(float, string)>();
        readonly List<string> _recentSays = new List<string>();
        public static readonly List<string> Biography = new List<string>();   // переживает смену уровней

        // застревание
        float _stuckRefX, _stuckSince;
        int _stuckTries;
        // «учится» на ошибках: смерти в одном месте снижают импульсивность
        readonly Dictionary<int, int> _deathsAt = new Dictionary<int, int>();
        int _trapsSeen;
        bool _cursorNoticed;

        public LlmClient Llm => _llm;
        public bool Busy => _scriptedBusy || _bubble.SpeechBusy;

        public void Init(BallController ball, LevelRuntime lv, BrainConfig cfg, LlmClient llm, PhraseBank bank,
            IVoice voice, ThoughtBubble bubble)
        {
            _ball = ball; _lv = lv; _cfg = cfg; _llm = llm; _bank = bank; _voice = voice; _bubble = bubble;
            _nav = new Navigator(lv.Grid);
            Awareness = lv.Data.awareness;
            _nav.Impulsivity = Mathf.Lerp(0.8f, 0.35f, Awareness / 5f);
            _stuckRefX = ball.transform.position.x;
            _stuckSince = Time.time;
            _nextThink = Time.time + 3f;

            GameEvents.BallSplat += OnSplat;
            GameEvents.BallReformed += OnReformed;
            GameEvents.TrapFired += OnTrap;
            GameEvents.FragmentFound += OnFragment;
            GameEvents.CheckpointReached += OnCheckpoint;
            GameEvents.BallJumped += OnJumped;

            foreach (var line in lv.Data.intro) Enqueue(line, Awareness >= 4 ? "glitch" : "neutral", false);
        }

        void OnDestroy()
        {
            GameEvents.BallSplat -= OnSplat;
            GameEvents.BallReformed -= OnReformed;
            GameEvents.TrapFired -= OnTrap;
            GameEvents.FragmentFound -= OnFragment;
            GameEvents.CheckpointReached -= OnCheckpoint;
            GameEvents.BallJumped -= OnJumped;
        }

        // ================================================================ речь
        public void Enqueue(string text, string mood, bool thought)
        {
            if (!string.IsNullOrEmpty(text)) _script.Enqueue((text, mood, thought));
        }

        public IEnumerator SayAndWait(string text, string mood)
        {
            Speak(text, mood, false);
            yield return null;
            while (_bubble.SpeechBusy) yield return null;
        }

        void Speak(string text, string mood, bool thought)
        {
            if (string.IsNullOrEmpty(text)) return;
            _ball.Visual.SetMood(mood, 3f);
            if (thought) { _bubble.Think(text); LastThought = text; }
            else
            {
                _bubble.Say(text);
                LastSay = text;
                _voice?.Speak(text, mood);
                _recentSays.Add(text);
                if (_recentSays.Count > 5) _recentSays.RemoveAt(0);
            }
        }

        bool React(string key, float chance = 1f)
        {
            if (Random.value > chance || _bubble.SpeechBusy) return false;
            if (_bank.Pick(key, Awareness, out var line, out var mood)) { Speak(line, mood, false); return true; }
            return false;
        }

        void Remember(string what)
        {
            _memory.Add((Time.time, what));
            if (_memory.Count > 10) _memory.RemoveAt(0);
        }

        // ================================================================ события мира
        void OnSplat(DeathKind kind, bool died)
        {
            int cell = Mathf.FloorToInt(_ball.transform.position.x);
            switch (kind)
            {
                case DeathKind.Crushed: Remember("меня раздавило прессом в лепёшку"); React("crushed"); break;
                case DeathKind.Spikes: Remember("наткнулся на шипы и погиб"); React("spikes"); break;
                case DeathKind.Pit: Remember("упал в бездонную яму и погиб"); React("pit"); break;
                default: Remember("разбился в лепёшку от падения"); React("splat_land"); break;
            }
            if (died)
            {
                _deathsAt.TryGetValue(cell / 4, out int n);
                _deathsAt[cell / 4] = n + 1;
                if (n + 1 >= 2) _nav.Impulsivity = Mathf.Max(0.05f, _nav.Impulsivity * 0.6f);   // учится
            }
            _nextThink = Time.time + 1.8f;
        }

        void OnReformed()
        {
            if (Random.value < 0.6f) React("respawn");
            Current = Intent.Forward;
            _stuckSince = Time.time;
            _stuckRefX = _ball.transform.position.x;
        }

        void OnTrap(TrapBase t)
        {
            float d = Vector2.Distance(t.Center, _ball.transform.position);
            if (d > 7f) return;
            _trapsSeen++;
            Remember($"{t.Title.ToLower()} сработал(а) сам(а) по себе рядом со мной");
            // на поздних стадиях шарик всё чаще «чувствует» наблюдателя
            if (!React("trap_fired", Mathf.Lerp(0.35f, 0.9f, Awareness / 5f)))
                _ball.Visual.SetMood(Awareness >= 3 ? "suspicious" : "scared", 1.5f);
            if (Awareness >= 3) _ball.Visual.LookAt(t.Center);
        }

        void OnFragment(string text)
        {
            Remember("нашёл осколок кода: " + text);
            Enqueue(text, "awe", false);
            if (_bank.Pick("fragment_react", Awareness, out var line, out var mood)) Enqueue(line, mood, true);
        }

        void OnCheckpoint(Vector2 p) { Remember("дотронулся до флажка-чекпоинта"); React("checkpoint", 0.7f); }
        void OnJumped() { React("jump", 0.12f); }

        // ================================================================ цикл
        void Update()
        {
            if (_ball == null || _lv == null) return;
            var pos = (Vector2)_ball.transform.position;

            // сценарные реплики имеют приоритет
            if (!_bubble.SpeechBusy && _script.Count > 0)
            {
                var s = _script.Dequeue();
                Speak(s.text, s.mood, s.thought);
                _scriptedBusy = true;
            }
            else if (_script.Count == 0 && !_bubble.SpeechBusy) _scriptedBusy = false;

            if (!_ball.IsAlive) return;

            // реплики, привязанные к месту (lines[].x)
            var lines = _lv.Data.lines;
            for (int i = 0; i < lines.Length; i++)
                if (!_linesDone.Contains(i) && pos.x >= lines[i].x)
                {
                    _linesDone.Add(i);
                    Enqueue(lines[i].text, lines[i].mood, false);
                    Remember("подумал: " + lines[i].text);
                }

            CheckCursor(pos);
            CheckStuck(pos);

            if (Time.time >= _intentUntil && Current != Intent.Forward) Current = Intent.Forward;

            if (Time.time >= _nextThink && !_scriptedBusy && _script.Count == 0)
            {
                _nextThink = Time.time + Random.Range(_cfg.thinkMin, _cfg.thinkMax);
                if (_llm.CanAsk) StartCoroutine(ThinkLlm());
                else if (!_llm.Busy) ThinkOffline();
            }
        }

        void FixedUpdate()
        {
            if (_ball == null || !_ball.IsAlive) return;
            int dir = _lv.Goal.x >= _ball.transform.position.x ? 1 : -1;
            _nav.IgnoreDanger = false;
            switch (Current)
            {
                case Intent.Forward: _nav.Steer(_ball, dir, 0.85f); break;
                case Intent.Back: _nav.Steer(_ball, -dir, 0.6f); break;
                case Intent.Yolo:
                    _nav.IgnoreDanger = true;
                    _nav.Steer(_ball, dir, 1.15f);
                    break;
                case Intent.RunJump:
                    _nav.Steer(_ball, dir, 1.1f);
                    break;
                case Intent.Jump:
                    if (_ball.CanJump)
                    {
                        var c = _nav.StandCell(_ball.transform.position);
                        if (_nav.TryAimedJump(_ball, _ball.transform.position, c, dir, out float vx)) _ball.Jump(vx);
                        else _ball.Jump(dir * 2f);
                        Current = Intent.Forward;
                    }
                    break;
                default:   // Wait, Pray, Look
                    _ball.MoveInput = 0;
                    break;
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
            if (Current != Intent.Forward && Current != Intent.Yolo && Current != Intent.RunJump)
            {
                _stuckSince = Time.time; _stuckRefX = pos.x; return;
            }
            if (Mathf.Abs(pos.x - _stuckRefX) > 1.2f) { _stuckRefX = pos.x; _stuckSince = Time.time; _stuckTries = 0; return; }
            float stuck = Time.time - _stuckSince;
            if (stuck > 5f)
            {
                _stuckTries++;
                _stuckSince = Time.time;
                Remember("застрял и не могу пройти дальше");
                React("stuck", 0.8f);
                // по очереди: отъехать и разогнаться → импульсивный рывок → помолиться
                if (_stuckTries % 3 == 1) { SetIntent(Intent.Back, 0.8f); }
                else if (_stuckTries % 3 == 2) { SetIntent(Intent.Yolo, 3f); }
                else { SetIntent(Intent.Pray, 2f); React("pray"); }
            }
        }

        void CheckCursor(Vector2 pos)
        {
            if (Awareness < 3) return;
            Vector2 mouse = Camera.main.ScreenToWorldPoint(InputShim.MousePos());
            float d = Vector2.Distance(mouse, pos);
            if (d < 1.6f)
            {
                _ball.Visual.LookAt(mouse);
                if (!_cursorNoticed && React("cursor")) { _cursorNoticed = true; Remember("заметил стрелочку-курсор рядом с собой"); }
            }
            else if (Awareness >= 4 && Random.value < 0.002f) _ball.Visual.LookAt(mouse);   // иногда косится на игрока
        }

        // ================================================================ мышление
        void ThinkOffline()
        {
            if (_bank.Pick("idle", Awareness, out var line, out var mood))
            {
                // чередуем мысли и реплики вслух
                Speak(line, mood, Random.value < 0.55f);
            }
            float r = Random.value;
            if (r < 0.08f) SetIntent(Intent.Pray, 2f);
            else if (r < 0.14f) SetIntent(Intent.Look, 1.6f);
            else if (r < 0.14f + 0.08f * _nav.Impulsivity) SetIntent(Intent.Yolo, 2.5f);
        }

        IEnumerator ThinkLlm()
        {
            _bubble.ShowThinking(true);
            BrainReply reply = null;
            yield return _llm.Ask(BrainPrompt.System(), BrainPrompt.User(this, _ball, _lv, _nav, _memory, _recentSays, _trapsSeen),
                content => reply = BrainReply.Parse(content));
            _bubble.ShowThinking(false);
            if (reply == null) { ThinkOffline(); yield break; }
            if (_ball == null || !_ball.IsAlive) yield break;
            ApplyReply(reply);
        }

        void ApplyReply(BrainReply r)
        {
            string mood = string.IsNullOrEmpty(r.mood) ? "neutral" : r.mood.Trim().ToLower();
            if (!string.IsNullOrEmpty(r.thought)) Speak(Clip(r.thought), mood, true);
            if (!string.IsNullOrEmpty(r.say)) Speak(Clip(r.say), mood, false);
            switch ((r.action ?? "forward").Trim().ToLower())
            {
                case "back": SetIntent(Intent.Back, 1.2f); break;
                case "wait": SetIntent(Intent.Wait, 2f); break;
                case "jump": SetIntent(Intent.Jump, 0.5f); break;
                case "run_jump": SetIntent(Intent.RunJump, 2f); break;
                case "yolo": SetIntent(Intent.Yolo, 2.5f); break;
                case "pray": SetIntent(Intent.Pray, 2.2f); break;
                case "look": SetIntent(Intent.Look, 1.6f); break;
                default: SetIntent(Intent.Forward, 0f); break;
            }
        }

        static string Clip(string s)
        {
            s = s.Trim();
            return s.Length > 140 ? s.Substring(0, 137) + "..." : s;
        }

        public void OnLevelEnd()
        {
            if (_lv.Data.outro.Length > 0) Biography.Add($"«{_lv.Data.title}»: {_lv.Data.outro[_lv.Data.outro.Length - 1]}");
            if (Biography.Count > 6) Biography.RemoveAt(0);
        }

        public string MemoryDump()
        {
            var sb = new StringBuilder();
            foreach (var m in _memory) sb.Append($"{Time.time - m.time:0}с назад: {m.text}\n");
            return sb.ToString();
        }
    }
}
