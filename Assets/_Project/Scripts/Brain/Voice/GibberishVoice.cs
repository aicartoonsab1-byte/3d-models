using UnityEngine;

namespace Sharik
{
    /// <summary>
    /// Смешное мультяшное «бормотание» в духе Animal Crossing / Undertale: гласные — слоги-«боинги»,
    /// согласные — щелчки, высота и тембр по настроению, в конце фразы иногда «пик». Внешние программы не нужны.
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
            // Мультяшный лепет: каждый гласный — слог-«боинг» (высота съезжает сверху вниз), вибрато,
            // обертон на октаву выше; вопрос — вверх, в конце фразы иногда смешной «пик».
            float basePitch = 360f, wobble = 0.12f, glide = 1.35f, square = 0.6f;
            switch (mood)
            {
                case "scared": basePitch = 520f; wobble = 0.25f; glide = 1.6f; break;
                case "happy": basePitch = 430f; glide = 1.5f; break;
                case "awe": basePitch = 420f; glide = 0.75f; break;
                case "sad": basePitch = 230f; wobble = 0.05f; glide = 0.7f; square = 0.15f; break;
                case "angry": basePitch = 250f; glide = 1.15f; square = 1f; break;
                case "pray": basePitch = 300f; glide = 0.85f; square = 0.2f; break;
                case "glitch": basePitch = 140f; wobble = 0.4f; glide = 1f; square = 1f; break;
                case "determined": basePitch = 280f; glide = 1.1f; square = 0.8f; break;
                case "dizzy": basePitch = 380f; wobble = 0.35f; glide = 1.8f; break;
            }
            float step = 1f / Tuning.VoiceCharsPerSecond;
            int maxChars = Mathf.Min(text.Length, 120);
            bool squeak = Random.value < 0.35f;
            int total = Mathf.CeilToInt((maxChars * step + (squeak ? 0.3f : 0.1f)) * Rate);
            var data = new float[total];
            var rnd = new System.Random(text.GetHashCode());
            string trimmed = text.Trim();
            for (int i = 0; i < maxChars; i++)
            {
                char c = char.ToLowerInvariant(text[i]);
                int start = Mathf.FloorToInt(i * step * Rate);
                int vowel = "аоуыэяёюие".IndexOf(c);
                if (vowel < 0) vowel = "aoueiy".IndexOf(c);
                if (vowel >= 0)
                {
                    float f = basePitch * (0.8f + vowel * 0.07f) * (1f + (float)(rnd.NextDouble() * 2 - 1) * wobble);
                    if (trimmed.EndsWith("?") && i > maxChars - 5) f *= 1.45f;
                    if (trimmed.EndsWith("!") && i > maxChars - 5) f *= 1.2f;
                    Boing(data, start, (int)(Rate * step * 0.95f), f, glide, square);
                }
                else if (char.IsLetter(c) && rnd.NextDouble() < 0.4)
                {
                    Noise(data, start, (int)(Rate * 0.01f), rnd);
                }
            }
            if (squeak)
            {
                int at = Mathf.FloorToInt(maxChars * step * Rate) + Rate / 40;
                Boing(data, at, Rate / 10, 1700f, 0.55f, 0f);   // «пи-ик!»
            }
            var clip = AudioClip.Create("voice", total, 1, Rate, false);
            clip.SetData(data, 0);
            _src.Stop();
            _src.clip = clip;
            _src.volume = Volume;
            _src.Play();
        }

        /// <summary>Слог: частота скользит от f·glide к f, вибрато 22 Гц, обертон ×2.01.</summary>
        static void Boing(float[] d, int start, int len, float f, float glide, float square)
        {
            float ph = 0f, ph2 = 0f;
            for (int j = 0; j < len && start + j < d.Length; j++)
            {
                float t = j / (float)Rate;
                float k = Mathf.Clamp01(j / (len * 0.6f));
                float freq = f * Mathf.Lerp(glide, 1f, k) * (1f + 0.04f * Mathf.Sin(2f * Mathf.PI * 22f * t));
                ph = (ph + freq / Rate) % 1f;
                ph2 = (ph2 + freq * 2.01f / Rate) % 1f;
                float sq = ph < 0.5f ? 1f : -1f;
                float tri = 4f * Mathf.Abs(ph - 0.5f) - 1f;
                float env = Mathf.Min(1f, j / 50f) * Mathf.Pow(1f - j / (float)len, 1.5f);
                d[start + j] += ((sq * square + tri * (1f - square)) * 0.22f + Mathf.Sin(2f * Mathf.PI * ph2) * 0.08f) * env;
            }
        }

        static void Noise(float[] d, int start, int len, System.Random rnd)
        {
            for (int j = 0; j < len && start + j < d.Length; j++)
                d[start + j] += ((float)rnd.NextDouble() * 2f - 1f) * 0.08f * (1f - j / (float)len);
        }
    }
}
