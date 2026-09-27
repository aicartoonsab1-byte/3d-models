using UnityEngine;

namespace Sharik
{
    /// <summary>
    /// 8-битное «бормотание» в духе Animal Crossing / Undertale: каждый гласный звук — писк нужной высоты,
    /// согласные — короткие щелчки. Высота и тембр зависят от настроения. Никаких внешних программ не нужно.
    /// </summary>
    public class GibberishVoice : MonoBehaviour, IVoice
    {
        AudioSource _src;
        const int Rate = 22050;
        public bool Muted { get; set; }
        public float Volume = 0.55f;

        void Awake()
        {
            _src = gameObject.AddComponent<AudioSource>();
            _src.playOnAwake = false;
        }

        public void Stop() => _src.Stop();

        public void Speak(string text, string mood)
        {
            if (Muted || string.IsNullOrEmpty(text)) return;
            float basePitch = 330f, wobble = 0.08f, square = 0.5f;
            switch (mood)
            {
                case "scared": basePitch = 470f; wobble = 0.2f; break;
                case "happy": case "awe": basePitch = 400f; break;
                case "sad": basePitch = 240f; wobble = 0.04f; break;
                case "angry": basePitch = 260f; square = 0.85f; break;
                case "pray": basePitch = 300f; square = 0.2f; break;
                case "glitch": basePitch = 200f; square = 1f; wobble = 0.35f; break;
                case "determined": basePitch = 280f; square = 0.7f; break;
                case "dizzy": basePitch = 350f; wobble = 0.3f; break;
            }
            float step = 1f / Tuning.VoiceCharsPerSecond;
            int maxChars = Mathf.Min(text.Length, 90);
            int total = Mathf.CeilToInt(maxChars * step * Rate) + Rate / 10;
            var data = new float[total];
            var rnd = new System.Random(text.GetHashCode());
            for (int i = 0; i < maxChars; i++)
            {
                char c = char.ToLowerInvariant(text[i]);
                int start = Mathf.FloorToInt(i * step * Rate);
                int vowel = "аоуыэяёюие".IndexOf(c);
                if (vowel < 0) vowel = "aoueiy".IndexOf(c);
                if (vowel >= 0)
                {
                    float f = basePitch * (0.8f + vowel * 0.06f) * (1f + (float)(rnd.NextDouble() * 2 - 1) * wobble);
                    if (text.EndsWith("?") && i > maxChars - 4) f *= 1.3f;   // вопросительная интонация
                    Tone(data, start, (int)(Rate * step * 0.9f), f, square);
                }
                else if (char.IsLetter(c) && rnd.NextDouble() < 0.5)
                {
                    Noise(data, start, (int)(Rate * 0.012f), rnd);
                }
            }
            var clip = AudioClip.Create("voice", total, 1, Rate, false);
            clip.SetData(data, 0);
            _src.Stop();
            _src.clip = clip;
            _src.volume = Volume;
            _src.Play();
        }

        static void Tone(float[] d, int start, int len, float freq, float square)
        {
            for (int j = 0; j < len && start + j < d.Length; j++)
            {
                float t = j / (float)Rate;
                float ph = (t * freq) % 1f;
                float sq = ph < 0.5f ? 1f : -1f;
                float tri = 4f * Mathf.Abs(ph - 0.5f) - 1f;
                float env = Mathf.Min(1f, j / 60f) * Mathf.Min(1f, (len - j) / 200f);
                d[start + j] += (sq * square + tri * (1f - square)) * 0.25f * env;
            }
        }

        static void Noise(float[] d, int start, int len, System.Random rnd)
        {
            for (int j = 0; j < len && start + j < d.Length; j++)
                d[start + j] += ((float)rnd.NextDouble() * 2f - 1f) * 0.08f * (1f - j / (float)len);
        }
    }
}
