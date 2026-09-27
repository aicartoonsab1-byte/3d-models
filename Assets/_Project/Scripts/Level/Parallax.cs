using UnityEngine;

namespace Sharik
{
    /// <summary>Параллакс фона относительно камеры.</summary>
    public class Parallax : MonoBehaviour
    {
        public float factor = 0.5f;
        public Vector3 origin;
        Transform _cam;
        void Start() { _cam = Camera.main.transform; origin = transform.position; }
        void LateUpdate()
        {
            if (_cam == null) return;
            var p = origin + new Vector3(_cam.position.x * factor, _cam.position.y * factor * 0.3f, 0);
            float ppu = Tuning.PixelsPerUnit;
            transform.position = new Vector3(Mathf.Round(p.x * ppu) / ppu, Mathf.Round(p.y * ppu) / ppu, p.z);
        }
    }
}
