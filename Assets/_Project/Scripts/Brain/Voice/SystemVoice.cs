using System;
using System.Collections;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;
using Debug = UnityEngine.Debug;

namespace Sharik
{
    /// <summary>
    /// Голос, установленный в Windows (SAPI5): например «IVONA 2 Maxim» — тот самый «бот Максим».
    /// Синтез через PowerShell + System.Speech в wav, потом играем как обычный клип.
    /// Имя голоса ищется по подстроке (brain_config: systemVoice, по умолчанию "Maxim").
    /// Сначала пробуем 64-битный PowerShell, если голос не найден — 32-битный (многие SAPI-голоса 32-битные).
    /// Не Windows или голоса нет — откат на 8-битное бормотание.
    /// </summary>
    public class SystemVoice : MonoBehaviour, IVoice
    {
        public string VoiceName = "Maxim";
        public GibberishVoice Fallback;
        public bool Muted { get; set; }
        AudioSource _src;
        int _counter;
        bool _broken;

        void Awake()
        {
            _src = gameObject.AddComponent<AudioSource>();
            _src.playOnAwake = false;
        }

        public void Stop() => _src.Stop();

        public void Speak(string text, string mood)
        {
            if (Muted) return;
            if (_broken || Application.platform != RuntimePlatform.WindowsEditor && Application.platform != RuntimePlatform.WindowsPlayer)
            { Fallback.Speak(text, mood); return; }
            StartCoroutine(Run(text, mood));
        }

        static string Ps64 => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
        static string Ps32 => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "SysWOW64", "WindowsPowerShell", "v1.0", "powershell.exe");

        /// <summary>Синтез в wav. Возвращает код: 0 — ок, 3 — голос не найден, иное — ошибка.</summary>
        public static int Synthesize(string ps, string voice, string text, string wav, int rate)
        {
            string txt = wav + ".txt";
            File.WriteAllText(txt, text, new System.Text.UTF8Encoding(false));
            string q(string s) => s.Replace("'", "''");
            string script =
                "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; " +
                $"$v = $s.GetInstalledVoices() | ForEach-Object {{ $_.VoiceInfo.Name }} | Where-Object {{ $_ -like '*{q(voice)}*' }} | Select-Object -First 1; " +
                "if (-not $v) { exit 3 }; $s.SelectVoice($v); " +
                $"$s.Rate = {rate}; $s.SetOutputToWaveFile('{q(wav)}'); " +
                $"$s.Speak([IO.File]::ReadAllText('{q(txt)}', [Text.Encoding]::UTF8)); $s.Dispose()";
            var psi = new ProcessStartInfo(ps, "-NoProfile -ExecutionPolicy Bypass -Command \"" + script.Replace("\"", "\\\"") + "\"")
            { UseShellExecute = false, CreateNoWindow = true, RedirectStandardError = true, RedirectStandardOutput = true };
            using (var p = Process.Start(psi))
            {
                p.WaitForExit(20000);
                return p.HasExited ? p.ExitCode : -1;
            }
        }

        /// <summary>Список установленных голосов (для меню и Console).</summary>
        public static string ListVoices(string ps)
        {
            try
            {
                var psi = new ProcessStartInfo(ps, "-NoProfile -Command \"Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }\"")
                { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true };
                using (var p = Process.Start(psi)) { string o = p.StandardOutput.ReadToEnd(); p.WaitForExit(10000); return o.Trim(); }
            }
            catch (Exception e) { return "ошибка: " + e.Message; }
        }
        public static string PowerShell64 => Ps64;
        public static string PowerShell32 => Ps32;

        IEnumerator Run(string text, string mood)
        {
            string wav = Path.Combine(Application.temporaryCachePath, $"sharik_sys_{_counter++ % 4}.wav");
            // настроение → скорость (SAPI Rate: -10..10); Максим звучит смешнее всего ровно и чуть быстрее
            int rate = mood == "scared" || mood == "angry" ? 2 : mood == "sad" || mood == "pray" ? -2 : 0;
            string voice = VoiceName;
            var task = Task.Run(() =>
            {
                try
                {
                    int code = Synthesize(Ps64, voice, text, wav, rate);
                    if (code == 3 && File.Exists(Ps32)) code = Synthesize(Ps32, voice, text, wav, rate);
                    return code;
                }
                catch (Exception e) { Debug.LogWarning("[Шарик] Системный голос: " + e.Message); return -1; }
            });
            while (!task.IsCompleted) yield return null;
            if (task.Result != 0)
            {
                if (task.Result == 3) { _broken = true; Debug.LogWarning($"[Шарик] Голос «{VoiceName}» не найден в Windows. Меню «Шарик/Голос/Показать голоса Windows»."); }
                Fallback.Speak(text, mood); yield break;
            }
            using (var req = UnityWebRequestMultimedia.GetAudioClip("file://" + wav, AudioType.WAV))
            {
                yield return req.SendWebRequest();
                if (req.result != UnityWebRequest.Result.Success) { Fallback.Speak(text, mood); yield break; }
                _src.Stop();
                _src.clip = DownloadHandlerAudioClip.GetContent(req);
                _src.pitch = mood == "glitch" ? 0.8f : mood == "scared" ? 1.08f : 1f;   // почти ровно — это же бот
                _src.Play();
            }
        }
    }
}
