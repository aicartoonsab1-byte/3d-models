using System;
using System.IO;
using UnityEngine;

namespace Sharik
{
    /// <summary>
    /// Настройки нейросети. Порядок загрузки (каждый следующий перекрывает предыдущий):
    ///   1) Resources/Brain/brain_config.json (в репозитории)
    ///   2) brain_config.local.json в корне проекта (только редактор; в .gitignore — сюда кладут API-ключи)
    ///   3) &lt;persistentDataPath&gt;/brain_config.json (для собранной игры)
    /// </summary>
    [Serializable]
    public class BrainConfig
    {
        public string endpoint = "http://localhost:11434/v1/chat/completions";   // любой OpenAI-совместимый
        public string model = "qwen2.5:3b";
        public string apiKey = "";
        public float temperature = 0.95f;
        public int maxTokens = 220;
        public bool jsonMode = true;
        public float timeoutSeconds = 25f;
        public float thinkMin = 4f, thinkMax = 7f;
        public bool useLlm = true;
        public string voice = "gibberish";     // gibberish | piper | off
        public string piperExe = "";
        public string piperModel = "";
        public float voiceVolume = 0.55f;

        public static BrainConfig Load()
        {
            var cfg = new BrainConfig();
            var ta = Resources.Load<TextAsset>("Brain/brain_config");
            if (ta != null) JsonUtility.FromJsonOverwrite(ta.text, cfg);
            TryOverlay(Path.Combine(Application.dataPath, "..", "brain_config.local.json"), cfg);
            TryOverlay(Path.Combine(Application.persistentDataPath, "brain_config.json"), cfg);
            return cfg;
        }

        static void TryOverlay(string path, BrainConfig cfg)
        {
            try
            {
                if (File.Exists(path))
                {
                    JsonUtility.FromJsonOverwrite(File.ReadAllText(path), cfg);
                    Debug.Log($"[Шарик] Настройки мозга из {path}");
                }
            }
            catch (Exception e) { Debug.LogWarning($"[Шарик] Не удалось прочитать {path}: {e.Message}"); }
        }
    }
}
