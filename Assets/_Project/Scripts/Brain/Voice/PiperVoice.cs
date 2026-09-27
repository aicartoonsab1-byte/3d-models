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
    /// Настоящий голос через Piper TTS (бесплатный, офлайн, есть русские голоса: ru_RU-denis, dmitri, irina, ruslan).
    /// Нужны piper(.exe) и модель .onnx — пути задаются в brain_config (piperExe, piperModel).
    /// Если что-то не так — тихо откатываемся на 8-битное бормотание.
    /// </summary>
    public class PiperVoice : MonoBehaviour, IVoice
    {
        public string Exe, Model;
        public GibberishVoice Fallback;
        public bool Muted { get; set; }
        AudioSource _src;
        int _counter;

        void Awake()
        {
            _src = gameObject.AddComponent<AudioSource>();
            _src.playOnAwake = false;
        }

        public void Stop() => _src.Stop();

        public void Speak(string text, string mood)
        {
            if (Muted) return;
            if (!File.Exists(Exe) || !File.Exists(Model)) { Fallback.Speak(text, mood); return; }
            StartCoroutine(Run(text, mood));
        }

        IEnumerator Run(string text, string mood)
        {
            string wav = Path.Combine(Application.temporaryCachePath, $"sharik_voice_{_counter++ % 4}.wav");
            // настроение → скорость речи (length_scale: меньше = быстрее)
            string speed = mood == "scared" || mood == "angry" ? "0.8" : mood == "sad" || mood == "pray" ? "1.25" : "1.0";
            var task = Task.Run(() =>
            {
                try
                {
                    var psi = new ProcessStartInfo(Exe, $"--model \"{Model}\" --length_scale {speed} --output_file \"{wav}\"")
                    {
                        UseShellExecute = false, RedirectStandardInput = true, CreateNoWindow = true,
                        RedirectStandardError = true, RedirectStandardOutput = true,
                    };
                    using (var p = Process.Start(psi))
                    {
                        var bytes = System.Text.Encoding.UTF8.GetBytes(text + "\n");   // UTF-8 для кириллицы
                        p.StandardInput.BaseStream.Write(bytes, 0, bytes.Length);
                        p.StandardInput.Close();
                        p.WaitForExit(15000);
                        return p.ExitCode == 0;
                    }
                }
                catch (Exception e) { Debug.LogWarning("[Шарик] Piper: " + e.Message); return false; }
            });
            while (!task.IsCompleted) yield return null;
            if (!task.Result) { Fallback.Speak(text, mood); yield break; }

            using (var req = UnityWebRequestMultimedia.GetAudioClip("file://" + wav, AudioType.WAV))
            {
                yield return req.SendWebRequest();
                if (req.result != UnityWebRequest.Result.Success) { Fallback.Speak(text, mood); yield break; }
                _src.Stop();
                _src.clip = DownloadHandlerAudioClip.GetContent(req);
                // писклявый «бурундук»: настоящая речь, задранная по высоте; в «матрице» — наоборот, басом
                _src.pitch = mood switch
                {
                    "glitch" => 0.7f, "sad" => 1.2f, "pray" => 1.25f, "angry" => 1.3f,
                    "scared" => 1.6f, "happy" => 1.5f, _ => 1.4f,
                };
                _src.Play();
            }
        }
    }
}
