using UnityEngine;

namespace Sharik
{
    /// <summary>
    /// Автозапуск: нажмите Play в ЛЮБОЙ сцене (хоть в пустой SampleScene) — игра соберётся сама из кода.
    /// Чтобы отключить в конкретной сцене, добавьте на любой объект компонент NoAutoBootstrap.
    /// </summary>
    public static class Bootstrap
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot()
        {
            if (Compat.FindAny<GameManager>() != null) return;
            if (Compat.FindAny<NoAutoBootstrap>() != null) return;
            new GameObject("[Шарик] Game").AddComponent<GameManager>();
        }
    }

    /// <summary>Маркер: не запускать игру автоматически в этой сцене.</summary>
    public class NoAutoBootstrap : MonoBehaviour { }
}
