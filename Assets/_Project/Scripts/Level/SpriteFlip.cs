using UnityEngine;

namespace Sharik
{
    /// <summary>Двухкадровая анимация спрайта: base_0 / base_1 (конвейеры и т.п.).</summary>
    public class SpriteFlip : MonoBehaviour
    {
        string _base;
        float _fps;
        SpriteRenderer _sr;
        public void Init(string baseName, float fps) { _base = baseName; _fps = fps; _sr = GetComponent<SpriteRenderer>(); }
        void Update() { if (_sr != null) _sr.sprite = SpriteLib.Get($"{_base}_{(int)(Time.time * _fps) % 2}"); }
    }
}
