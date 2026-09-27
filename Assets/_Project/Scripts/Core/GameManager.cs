using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Sharik
{
    /// <summary>Дирижёр игры: уровни, шарик, мозг, камера, интерфейс, переходы и финал.</summary>
    public class GameManager : MonoBehaviour
    {
        public static GameManager I { get; private set; }

        public LevelRuntime Level { get; private set; }
        public BallController Ball { get; private set; }
        public BallBrain Brain { get; private set; }
        public TrapController Traps { get; private set; }
        public BrainConfig Cfg { get; private set; }
        public bool InputLocked { get; private set; }
        public bool Paused { get; private set; }
        public int LevelIndex { get; private set; }

        readonly List<LevelData> _levels = new List<LevelData>();
        LlmClient _llm;
        PhraseBank _bank;
        IVoice _voice;
        ThoughtBubble _bubble;
        Hud _hud;
        CameraRig _cam;
        Coroutine _flow, _glitch;
        bool _waitingRestart;

        void Awake()
        {
            I = this;
            Application.targetFrameRate = 60;
            Time.fixedDeltaTime = 1f / 60f;
            Physics2D.gravity = new Vector2(0, -9.81f);

            foreach (var ta in Resources.LoadAll<TextAsset>("Levels"))
            {
                try { _levels.Add(LevelData.FromJson(ta.text)); }
                catch (System.Exception e) { Debug.LogError($"[Шарик] Уровень {ta.name} не читается: {e.Message}"); }
            }
            _levels.Sort((a, b) => a.order.CompareTo(b.order));
            if (_levels.Count == 0) { Debug.LogError("[Шарик] Нет уровней в Resources/Levels"); enabled = false; return; }

            Cfg = BrainConfig.Load();
            _llm = new LlmClient(Cfg);
            _bank = new PhraseBank();
            Sfx.Init(gameObject);
            _cam = CameraRig.Setup();
            _bubble = gameObject.AddComponent<ThoughtBubble>();
            _hud = gameObject.AddComponent<Hud>();
            Traps = gameObject.AddComponent<TrapController>();

            var gib = gameObject.AddComponent<GibberishVoice>();
            gib.Volume = Cfg.voiceVolume;
            if (Cfg.voice == "piper")
            {
                var pv = gameObject.AddComponent<PiperVoice>();
                pv.Exe = Cfg.piperExe; pv.Model = Cfg.piperModel; pv.Fallback = gib;
                _voice = pv;
            }
            else if (Cfg.voice == "system")
            {
                var sv = gameObject.AddComponent<SystemVoice>();
                sv.VoiceName = Cfg.systemVoice; sv.Fallback = gib;
                _voice = sv;
            }
            else if (Cfg.voice == "polly")
            {
                var po = gameObject.AddComponent<PollyVoice>();
                po.AccessKey = Cfg.awsAccessKey; po.SecretKey = Cfg.awsSecretKey; po.Region = Cfg.awsRegion; po.VoiceId = Cfg.pollyVoice; po.Fallback = gib;
                _voice = po;
            }
            else _voice = gib;
            if (Cfg.voice == "off") _voice.Muted = true;

            LoadLevel(Mathf.Clamp(PlayerPrefs.GetInt("sharik_level", 0), 0, _levels.Count - 1));
        }

        void OnDestroy() { if (I == this) { I = null; GameEvents.Clear(); } }

        // ================================================================ уровни
        public void LoadLevel(int index)
        {
            if (_flow != null) StopCoroutine(_flow);
            if (_glitch != null) StopCoroutine(_glitch);
            GameEvents.Clear();
            if (Level != null) Destroy(Level.Root.gameObject);
            if (Ball != null) Destroy(Ball.gameObject);
            _bubble.Clear();

            LevelIndex = (index % _levels.Count + _levels.Count) % _levels.Count;
            PlayerPrefs.SetInt("sharik_level", LevelIndex);
            var data = _levels[LevelIndex];
            Level = LevelBuilder.Build(data);
            Camera.main.backgroundColor = Level.Sky;

            Ball = BallController.Create(Level.Spawn);
            Brain = Ball.gameObject.AddComponent<BallBrain>();
            Brain.Init(Ball, Level, Cfg, _llm, _bank, _voice, _bubble);
            _bubble.Target = Ball.transform;
            _cam.Target = Ball.transform;
            _cam.SetLevelSize(data.Width, data.Height);
            _cam.SnapTo(Level.Spawn);

            InputLocked = false;
            _hud.Fade = 0;
            _flow = StartCoroutine(TitleCard(data.title, data.act > 0 ? $"Акт {Roman(data.act)}" : ""));
            if (data.awareness >= 3) _glitch = StartCoroutine(Glitches(data.awareness));
        }

        IEnumerator TitleCard(string title, string sub)
        {
            _hud.Big = title; _hud.Small = sub;
            for (float t = 0; t < 3f; t += Time.deltaTime)
            {
                _hud.BigAlpha = t < 0.3f ? t / 0.3f : t > 2.4f ? (3f - t) / 0.6f : 1f;
                yield return null;
            }
            _hud.BigAlpha = 0;
        }

        static string Roman(int n) => n switch { 1 => "I", 2 => "II", 3 => "III", 4 => "IV", 5 => "V", 6 => "VI", _ => n.ToString() };

        public void OnReachedExit(BallController ball)
        {
            if (InputLocked) return;
            _flow = StartCoroutine(ExitFlow(ball));
        }

        IEnumerator ExitFlow(BallController ball)
        {
            InputLocked = true;
            ball.Freeze();
            StartCoroutine(Brain.Reflect());             // дневник и пересмотр убеждений — на GameManager, переживёт смену уровня
            GameEvents.RaiseLevelFinished();
            foreach (var line in Level.Data.outro) yield return Brain.SayAndWait(line, "happy");
            Sfx.Play(Sfx.Id.Exit);
            for (float t = 0; t < 0.8f; t += Time.deltaTime)
            {
                _hud.Fade = t / 0.8f;
                yield return null;
            }
            _hud.Fade = 1;
            LoadLevel(LevelIndex + 1);
        }

        // ================================================================ глитчи матрицы
        IEnumerator Glitches(int awareness)
        {
            while (true)
            {
                yield return new WaitForSeconds(awareness >= 5 ? Random.Range(2f, 5f) : Random.Range(5f, 12f));
                if (Level == null || Paused) continue;
                var list = Level.WorldSprites.Where(s => s != null).ToList();
                if (list.Count == 0) continue;
                Sfx.Play(Sfx.Id.Glitch, 0.2f);
                var picked = new List<(SpriteRenderer sr, Vector3 pos, Color c)>();
                for (int i = 0; i < Mathf.Min(12, list.Count); i++)
                {
                    var sr = list[Random.Range(0, list.Count)];
                    picked.Add((sr, sr.transform.localPosition, sr.color));
                    sr.transform.localPosition += new Vector3(Random.Range(-3, 4), 0, 0) / Tuning.PixelsPerUnit;
                    sr.color = Random.value < 0.5f ? new Color(0.3f, 1f, 0.6f) : new Color(1f, 0.3f, 0.9f);
                }
                yield return new WaitForSeconds(0.12f);
                foreach (var p in picked)
                    if (p.sr != null) { p.sr.transform.localPosition = p.pos; p.sr.color = p.c; }
            }
        }

        // ================================================================ финал
        public void StartEnding(FinalSwitch sw, BallController ball)
        {
            if (InputLocked) return;
            _flow = StartCoroutine(Ending(sw, ball));
        }

        IEnumerator Ending(FinalSwitch sw, BallController ball)
        {
            InputLocked = true;
            ball.Freeze();
            foreach (var t in Level.Traps) t.Disabled = true;
            if (_glitch != null) StopCoroutine(_glitch);

            var outro = Level.Data.outro;
            for (int i = 0; i < outro.Length - 1; i++) yield return Brain.SayAndWait(outro[i], i % 2 == 0 ? "determined" : "sad");
            yield return new WaitForSeconds(0.6f);

            sw.Flip();
            Sfx.Play(Sfx.Id.SwitchClunk);
            CameraRig.Shake(0.5f, 0.25f);
            yield return new WaitForSeconds(0.8f);
            Sfx.Play(Sfx.Id.PowerDown);

            // мир исчезает: плитки гаснут в случайном порядке, мерцая
            var sprites = Level.WorldSprites.Where(s => s != null && s != sw.Sr).OrderBy(_ => Random.value).ToList();
            var sky = Camera.main.backgroundColor;
            float dur = 4f;
            int idx = 0;
            for (float t = 0; t < dur; t += Time.deltaTime)
            {
                float k = t / dur;
                int target = Mathf.RoundToInt(sprites.Count * k * k);
                for (; idx < target; idx++) sprites[idx].enabled = false;
                for (int j = 0; j < 6 && idx + j < sprites.Count; j++)
                    sprites[idx + j].enabled = Random.value > 0.5f;
                Camera.main.backgroundColor = Color.Lerp(sky, Color.black, k);
                yield return null;
            }
            foreach (var s in sprites) if (s != null) s.enabled = false;
            yield return new WaitForSeconds(0.4f);
            sw.Sr.enabled = false;
            Sfx.Play(Sfx.Id.Glitch);
            yield return new WaitForSeconds(1.2f);

            if (outro.Length > 0) yield return Brain.SayAndWait(outro[outro.Length - 1], "awe");
            yield return new WaitForSeconds(0.8f);
            _bubble.Clear();
            yield return ball.Visual.Dissolve();
            ball.Vanish();
            yield return new WaitForSeconds(1.5f);

            int loops = PlayerPrefs.GetInt("sharik_loops", 0) + 1;
            PlayerPrefs.SetInt("sharik_loops", loops);
            _hud.Big = "КОНЕЦ";
            _hud.Small = "Шарик выключил мир.\nИли мир выключил шарик?\n\n" +
                         $"Лепёшек за игру: {ball.Splats}.  Циклов: {loops}.\n\nНажми любую клавишу, чтобы… начать заново?";
            for (float t = 0; t < 1.5f; t += Time.deltaTime) { _hud.BigAlpha = t / 1.5f; yield return null; }
            _hud.BigAlpha = 1;
            _waitingRestart = true;
        }

        // ================================================================ ввод
        void Update()
        {
            if (_waitingRestart)
            {
                if (InputShim.AnyKeyDown())
                {
                    _waitingRestart = false;
                    _hud.BigAlpha = 0;
                    Mind.I.loops++;
                    Mind.I.Save();
                    LoadLevel(0);
                }
                return;
            }
            if (InputShim.Down(InputShim.K.Escape))
            {
                Paused = !Paused;
                Time.timeScale = Paused ? 0f : 1f;
            }
            if (InputShim.Down(InputShim.K.F1)) _hud.ShowDebug = !_hud.ShowDebug;
            if (InputShim.Down(InputShim.K.F3)) _hud.ShowMind = !_hud.ShowMind;
            if (InputShim.Down(InputShim.K.F2)) Cfg.useLlm = !Cfg.useLlm;
            if (InputShim.Down(InputShim.K.M)) { Sfx.Muted = !Sfx.Muted; _voice.Muted = Sfx.Muted; }
            if (InputShim.Down(InputShim.K.R)) LoadLevel(LevelIndex);
            if (Paused && InputShim.Down(InputShim.K.N)) { TogglePauseOff(); LoadLevel(LevelIndex + 1); }
            if (Paused && InputShim.Down(InputShim.K.P)) { TogglePauseOff(); LoadLevel(LevelIndex - 1); }
        }

        void TogglePauseOff() { Paused = false; Time.timeScale = 1f; }
    }
}
