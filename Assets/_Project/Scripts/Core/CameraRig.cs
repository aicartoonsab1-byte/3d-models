using UnityEngine;

namespace Sharik
{
    /// <summary>
    /// Пиксель-перфект камера без пакетов: ортографический размер под 180 px по высоте,
    /// снап позиции к пиксельной сетке, плавное следование за шариком с упреждением, тряска.
    /// </summary>
    public class CameraRig : MonoBehaviour
    {
        static CameraRig _i;
        public Transform Target;
        Vector2 Min, Max;
        Camera _cam;
        Vector3 _vel;
        float _shakeT, _shakeAmp;
        float _look;

        public static CameraRig Setup()
        {
            var cam = Camera.main;
            if (cam == null)
            {
                var go = new GameObject("Main Camera") { tag = "MainCamera" };
                cam = go.AddComponent<Camera>();
                go.AddComponent<AudioListener>();
            }
            cam.orthographic = true;
            cam.orthographicSize = Tuning.OrthoSize;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.allowMSAA = false;
            cam.allowHDR = false;
            cam.transform.position = new Vector3(0, 0, -10);
            QualitySettings.antiAliasing = 0;
            _i = cam.GetComponent<CameraRig>();
            if (_i == null) _i = cam.gameObject.AddComponent<CameraRig>();
            _i._cam = cam;
            return _i;
        }

        public static void Shake(float time, float amp) { if (_i != null) { _i._shakeT = time; _i._shakeAmp = amp; } }

        public void SnapTo(Vector2 p)
        {
            transform.position = Clamp(new Vector3(p.x, p.y, -10));
        }

        Vector3 Clamp(Vector3 p)
        {
            float halfH = _cam.orthographicSize, halfW = halfH * _cam.aspect;
            SetBoundsFromCache(halfW, halfH);
            return new Vector3(Mathf.Clamp(p.x, Min.x, Max.x), Mathf.Clamp(p.y, Min.y, Max.y), -10);
        }

        float _lastW = -1, _lvlW, _lvlH;
        public void SetLevelSize(float w, float h) { _lvlW = w; _lvlH = h; _lastW = -1; }
        void SetBoundsFromCache(float halfW, float halfH)
        {
            if (Mathf.Approximately(_lastW, halfW)) return;
            _lastW = halfW;
            Min = new Vector2(halfW, halfH - 1f);
            Max = new Vector2(Mathf.Max(halfW, _lvlW - halfW), Mathf.Max(halfH - 1f, _lvlH - halfH + 1f));
        }

        void LateUpdate()
        {
            if (Target == null) return;
            var rb = Target.GetComponent<Rigidbody2D>();
            float vx = rb != null ? rb.Vel().x : 0f;
            _look = Mathf.Lerp(_look, Mathf.Clamp(vx * 0.5f, -2.5f, 2.5f), Time.deltaTime * 2f);
            var want = Clamp(new Vector3(Target.position.x + _look, Target.position.y + 1f, -10));
            var p = Vector3.SmoothDamp(transform.position, want, ref _vel, 0.18f);
            if (_shakeT > 0)
            {
                _shakeT -= Time.deltaTime;
                p += (Vector3)Random.insideUnitCircle * _shakeAmp;
            }
            float ppu = Tuning.PixelsPerUnit;
            transform.position = new Vector3(Mathf.Round(p.x * ppu) / ppu, Mathf.Round(p.y * ppu) / ppu, -10);
        }
    }
}
