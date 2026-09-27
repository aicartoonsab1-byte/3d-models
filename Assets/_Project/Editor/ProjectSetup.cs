using UnityEditor;
using UnityEngine;

namespace Sharik.EditorTools
{
    /// <summary>
    /// Одноразовая настройка проекта при открытии в редакторе:
    ///  • разрешает HTTP-запросы (локальная нейросеть Ollama работает по http://localhost);
    ///  • отключает сглаживание (пиксель-арт должен быть чётким).
    /// Плюс меню «Шарик» с полезными командами.
    /// </summary>
    [InitializeOnLoad]
    public static class ProjectSetup
    {
        static ProjectSetup()
        {
            EditorApplication.delayCall += Apply;
        }

        static void Apply()
        {
#if UNITY_2022_1_OR_NEWER
            if (PlayerSettings.insecureHttpOption != InsecureHttpOption.AlwaysAllowed)
            {
                PlayerSettings.insecureHttpOption = InsecureHttpOption.AlwaysAllowed;
                Debug.Log("[Шарик] Разрешены HTTP-запросы (нужно для локальной нейросети на http://localhost).");
            }
#endif
            if (QualitySettings.antiAliasing != 0) QualitySettings.antiAliasing = 0;
        }

        [MenuItem("Шарик/Переимпортировать спрайты")]
        static void ReimportSprites()
        {
            AssetDatabase.ImportAsset("Assets/_Project/Resources/Sprites", ImportAssetOptions.ImportRecursive | ImportAssetOptions.ForceUpdate);
        }

        [MenuItem("Шарик/Начать с первого уровня")]
        static void ResetProgress()
        {
            PlayerPrefs.DeleteKey("sharik_level");
            PlayerPrefs.DeleteKey("sharik_loops");
            Debug.Log("[Шарик] Прогресс сброшен: игра начнётся с первого уровня.");
        }

        [MenuItem("Шарик/Открыть папку настроек нейросети")]
        static void OpenConfigFolder() => EditorUtility.RevealInFinder(Application.persistentDataPath);
    }
}
