using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Networking;
using Debug = UnityEngine.Debug;

namespace Sharik.EditorTools
{
    /// <summary>
    /// Установка качественного голоса в один клик: меню «Шарик → Голос → Установить Piper: …».
    /// Скачивает офлайн-нейросеть синтеза речи Piper (бесплатная, MIT) под вашу ОС и русский голос,
    /// распаковывает в папку Piper/ в корне проекта и прописывает пути в brain_config.local.json.
    /// </summary>
    public static class PiperInstaller
    {
        const string Release = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/";
        const string Voices = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/ru/ru_RU/";

        static string Root => Path.GetFullPath(Path.Combine(Application.dataPath, "..", "Piper"));

        [MenuItem("Шарик/Голос/Установить Piper: Денис (мужской)")] static void Denis() => Install("denis");
        [MenuItem("Шарик/Голос/Установить Piper: Дмитрий (мужской)")] static void Dmitri() => Install("dmitri");
        [MenuItem("Шарик/Голос/Установить Piper: Ирина (женский)")] static void Irina() => Install("irina");
        [MenuItem("Шарик/Голос/Установить Piper: Руслан (мужской)")] static void Ruslan() => Install("ruslan");

        [MenuItem("Шарик/Голос/Бот Максим — голос Windows (IVONA Maxim)")]
        static void MaximSystem()
        {
            string voices = SystemVoice.ListVoices(SystemVoice.PowerShell64) + "\n" + (File.Exists(SystemVoice.PowerShell32) ? SystemVoice.ListVoices(SystemVoice.PowerShell32) : "");
            Debug.Log("[Шарик] Голоса Windows:\n" + voices);
            bool has = voices.IndexOf("Maxim", StringComparison.OrdinalIgnoreCase) >= 0 || voices.IndexOf("Максим", StringComparison.OrdinalIgnoreCase) >= 0;
            WriteConfig("system", "", "", "Maxim");
            EditorUtility.DisplayDialog("Шарик", has
                ? "Голос Максима найден в Windows. Нажмите Play — шарик заговорит голосом бота Максима."
                : "Голос Maxim в Windows не найден. Установите русский SAPI5-голос Maxim (например, IVONA 2 Maxim) и снова выберите этот пункт. Пока играет 8-битный лепет. Список голосов — в Console.", "Ок");
        }

        [MenuItem("Шарик/Голос/Бот Максим — Amazon Polly (нужен ключ AWS)")]
        static void MaximPolly()
        {
            WriteConfig("polly", "", "", null);
            EditorUtility.DisplayDialog("Шарик",
                "Голос «Maxim» из Amazon Polly. Впишите свои ключи в brain_config.local.json в корне проекта:\n" +
                "\"awsAccessKey\": \"…\", \"awsSecretKey\": \"…\", \"awsRegion\": \"eu-central-1\"\n\n" +
                "Ключ нужен с правом polly:SynthesizeSpeech. Файл в .gitignore и в репозиторий не попадёт.", "Ок");
        }

        [MenuItem("Шарик/Голос/Вернуть 8-битный лепет")]
        static void Babble() { WriteConfig("gibberish", "", "", null); Debug.Log("[Шарик] Голос: 8-битный лепет."); }

        static string ArchiveName()
        {
            switch (Application.platform)
            {
                case RuntimePlatform.WindowsEditor: return "piper_windows_amd64.zip";
                case RuntimePlatform.OSXEditor:
                    return System.Runtime.InteropServices.RuntimeInformation.ProcessArchitecture ==
                           System.Runtime.InteropServices.Architecture.Arm64 ? "piper_macos_aarch64.tar.gz" : "piper_macos_x64.tar.gz";
                default: return "piper_linux_x86_64.tar.gz";
            }
        }

        static string ExePath => Path.Combine(Root, "piper", Application.platform == RuntimePlatform.WindowsEditor ? "piper.exe" : "piper");

        static void Install(string voice)
        {
            Directory.CreateDirectory(Root);
            var jobs = new List<(string url, string file)>();
            string archive = Path.Combine(Root, ArchiveName());
            if (!File.Exists(ExePath)) jobs.Add((Release + ArchiveName(), archive));
            string model = Path.Combine(Root, "voices", $"ru_RU-{voice}-medium.onnx");
            Directory.CreateDirectory(Path.GetDirectoryName(model));
            if (!File.Exists(model)) jobs.Add(($"{Voices}{voice}/medium/ru_RU-{voice}-medium.onnx?download=true", model));
            if (!File.Exists(model + ".json")) jobs.Add(($"{Voices}{voice}/medium/ru_RU-{voice}-medium.onnx.json?download=true", model + ".json"));
            DownloadAll(jobs, 0, () =>
            {
                if (File.Exists(archive) && !File.Exists(ExePath)) Extract(archive);
                if (!File.Exists(ExePath)) { EditorUtility.DisplayDialog("Шарик", "Не получилось распаковать Piper. Подробности — в Console.", "Ок"); return; }
                if (Application.platform != RuntimePlatform.WindowsEditor) Run("chmod", $"+x \"{ExePath}\"");
                WriteConfig("piper", ExePath, model, null);
                bool ok = TestSpeak(model);
                EditorUtility.DisplayDialog("Шарик", ok
                    ? $"Голос «{voice}» установлен. Нажмите Play — шарик заговорит по-настоящему (голос чуть задран по высоте — так смешнее)."
                    : "Piper скачан, но тестовая фраза не синтезировалась. Проверьте Console; пока играет 8-битный лепет.", "Ок");
            });
        }

        static void DownloadAll(List<(string url, string file)> jobs, int i, Action done)
        {
            if (i >= jobs.Count) { EditorUtility.ClearProgressBar(); done(); return; }
            var (url, file) = jobs[i];
            var req = UnityWebRequest.Get(url);
            req.downloadHandler = new DownloadHandlerFile(file) { removeFileOnAbort = true };
            var op = req.SendWebRequest();
            void Tick()
            {
                if (EditorUtility.DisplayCancelableProgressBar("Шарик: качаю голос", $"{Path.GetFileName(file)} ({i + 1}/{jobs.Count})", req.downloadProgress))
                { req.Abort(); EditorApplication.update -= Tick; EditorUtility.ClearProgressBar(); req.Dispose(); return; }
                if (!op.isDone) return;
                EditorApplication.update -= Tick;
                bool ok = req.result == UnityWebRequest.Result.Success;
                if (!ok) Debug.LogError($"[Шарик] Не скачалось {url}: {req.error}");
                req.Dispose();
                if (!ok) { EditorUtility.ClearProgressBar(); EditorUtility.DisplayDialog("Шарик", "Не удалось скачать голос. Проверьте интернет и Console.", "Ок"); return; }
                DownloadAll(jobs, i + 1, done);
            }
            EditorApplication.update += Tick;
        }

        /// <summary>tar умеет и .tar.gz, и .zip (в Windows 10+ он встроен).</summary>
        static void Extract(string archive) => Run("tar", $"-xf \"{archive}\" -C \"{Root}\"");

        static bool Run(string exe, string args, string stdin = null)
        {
            try
            {
                var psi = new ProcessStartInfo(exe, args) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardError = true, RedirectStandardInput = stdin != null };
                using (var p = Process.Start(psi))
                {
                    if (stdin != null)
                    {
                        var b = System.Text.Encoding.UTF8.GetBytes(stdin + "\n");
                        p.StandardInput.BaseStream.Write(b, 0, b.Length);
                        p.StandardInput.Close();
                    }
                    p.WaitForExit(60000);
                    if (p.ExitCode != 0) Debug.LogWarning($"[Шарик] {exe} {args}: {p.StandardError.ReadToEnd()}");
                    return p.ExitCode == 0;
                }
            }
            catch (Exception e) { Debug.LogError($"[Шарик] {exe}: {e.Message}"); return false; }
        }

        static bool TestSpeak(string model)
        {
            string wav = Path.Combine(Root, "test.wav");
            return Run(ExePath, $"--model \"{model}\" --output_file \"{wav}\"", "Привет! Я шарик. Кажется, у меня теперь есть голос.") && File.Exists(wav);
        }

        /// <summary>Правит brain_config.local.json (он в .gitignore), сохраняя остальные поля.</summary>
        static void WriteConfig(string voice, string exe, string model, string systemVoice)
        {
            string path = Path.Combine(Application.dataPath, "..", "brain_config.local.json");
            var cfg = new Sharik.BrainConfig();
            var baseTa = Resources.Load<TextAsset>("Brain/brain_config");
            if (baseTa != null) JsonUtility.FromJsonOverwrite(baseTa.text, cfg);
            if (File.Exists(path)) JsonUtility.FromJsonOverwrite(File.ReadAllText(path), cfg);
            cfg.voice = voice;
            if (voice == "piper") { cfg.piperExe = exe; cfg.piperModel = model; }
            if (systemVoice != null) cfg.systemVoice = systemVoice;
            File.WriteAllText(path, JsonUtility.ToJson(cfg, true));
            Debug.Log($"[Шарик] Настройки голоса записаны в {Path.GetFullPath(path)}");
        }
    }
}
