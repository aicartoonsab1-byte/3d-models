using System.Collections.Generic;
using UnityEngine;

namespace Sharik
{
    /// <summary>Процедурные 8-битные звуки: генерируются кодом при старте, файлы не нужны.</summary>
    public class Sfx : MonoBehaviour
    {
        public enum Id { Jump, Land, Splat, Reform, Fall, Spikes, CrusherArm, CrusherSlam, Trapdoor, Fan, Spring,
            Checkpoint, Fragment, Denied, Exit, SwitchClunk, PowerDown, Glitch }

        static Sfx _i;
        const int Rate = 22050;
        readonly Dictionary<Id, AudioClip> _clips = new Dictionary<Id, AudioClip>();
        AudioSource[] _pool;
        int _next;
        public static bool Muted;

        public static void Init(GameObject host)
        {
            _i = host.AddComponent<Sfx>();
            _i._pool = new AudioSource[6];
            for (int k = 0; k < _i._pool.Length; k++) { _i._pool[k] = host.AddComponent<AudioSource>(); _i._pool[k].playOnAwake = false; }
            _i.Build();
        }

        public static void Play(Id id, float strength = 1f)
        {
            if (_i == null || Muted || !_i._clips.TryGetValue(id, out var clip)) return;
            var s = _i._pool[_i._next++ % _i._pool.Length];
            s.pitch = 1f + Random.Range(-0.05f, 0.05f);
            s.PlayOneShot(clip, Mathf.Lerp(0.35f, 0.8f, strength));
        }

        delegate float Wave(float t, float p);

        AudioClip Make(string name, float len, Wave w)
        {
            int n = Mathf.CeilToInt(len * Rate);
            var d = new float[n];
            for (int k = 0; k < n; k++) { float t = k / (float)Rate; d[k] = Mathf.Clamp(w(t, t / len), -1f, 1f) * 0.5f; }
            var c = AudioClip.Create(name, n, 1, Rate, false);
            c.SetData(d, 0);
            return c;
        }

        static float Sq(float t, float f) => (t * f) % 1f < 0.5f ? 1f : -1f;
        static float Tri(float t, float f) => 4f * Mathf.Abs((t * f) % 1f - 0.5f) - 1f;
        static float Nz() => Random.value * 2f - 1f;

        void Build()
        {
            var ph = 0f;
            _clips[Id.Jump] = Make("jump", 0.18f, (t, p) => Sq(t, Mathf.Lerp(300, 700, p)) * (1 - p) * 0.6f);
            _clips[Id.Land] = Make("land", 0.08f, (t, p) => Nz() * (1 - p) * 0.5f);
            _clips[Id.Splat] = Make("splat", 0.35f, (t, p) => (Nz() * 0.7f + Sq(t, Mathf.Lerp(160, 50, p)) * 0.5f) * (1 - p));
            _clips[Id.Reform] = Make("reform", 0.45f, (t, p) => Tri(t, Mathf.Lerp(120, 520, p) + Mathf.Sin(p * 40) * 40) * (1 - p * 0.5f) * 0.7f);
            _clips[Id.Fall] = Make("fall", 0.9f, (t, p) => Sq(t, Mathf.Lerp(900, 120, p)) * (1 - p) * 0.4f);
            _clips[Id.Spikes] = Make("spikes", 0.12f, (t, p) => (Sq(t, 1200) * 0.4f + Nz() * 0.4f) * (1 - p));
            _clips[Id.CrusherArm] = Make("arm", 0.2f, (t, p) => Sq(t, 90) * (p % 0.25f < 0.12f ? 0.5f : 0f));
            _clips[Id.CrusherSlam] = Make("slam", 0.4f, (t, p) => (Nz() * 0.8f + Sq(t, 55) * 0.6f) * Mathf.Pow(1 - p, 2));
            _clips[Id.Trapdoor] = Make("trapdoor", 0.25f, (t, p) => Sq(t, Mathf.Lerp(220, 90, p)) * (1 - p) * 0.6f);
            _clips[Id.Fan] = Make("fan", 0.6f, (t, p) => Nz() * 0.35f * (0.6f + 0.4f * Mathf.Sin(t * 60)) * (1 - p * 0.7f));
            _clips[Id.Spring] = Make("spring", 0.3f, (t, p) => Tri(t, 300 + Mathf.Sin(p * 60) * 180) * (1 - p));
            _clips[Id.Checkpoint] = Make("checkpoint", 0.35f, (t, p) => Sq(t, p < 0.33f ? 523 : p < 0.66f ? 659 : 784) * 0.4f * (1 - p * 0.5f));
            _clips[Id.Fragment] = Make("fragment", 0.4f, (t, p) => Sq(t, 880 + ((int)(p * 12) % 3) * 220) * 0.35f * (1 - p));
            _clips[Id.Denied] = Make("denied", 0.1f, (t, p) => Sq(t, 110) * 0.3f);
            _clips[Id.Exit] = Make("exit", 0.6f, (t, p) => Sq(t, 392 * Mathf.Pow(2, Mathf.Floor(p * 4) / 4f)) * 0.4f * (1 - p * 0.5f));
            _clips[Id.SwitchClunk] = Make("clunk", 0.5f, (t, p) => (Nz() * 0.6f + Sq(t, 70)) * Mathf.Pow(1 - p, 3));
            _clips[Id.PowerDown] = Make("powerdown", 3f, (t, p) =>
            {
                ph += Mathf.Lerp(440f, 20f, Mathf.Sqrt(p)) / Rate;
                return ((ph % 1f) < 0.5f ? 1f : -1f) * 0.5f * (1 - p);
            });
            _clips[Id.Glitch] = Make("glitch", 0.15f, (t, p) => Sq(t, Random.Range(100, 2000)) * 0.3f);
        }
    }
}
