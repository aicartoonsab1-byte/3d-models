using System;
using System.Collections;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace Sharik
{
    /// <summary>
    /// Голос Amazon Polly (по умолчанию «Maxim» — официальный наследник того самого «бота Максима»).
    /// Нужны ваши ключи AWS в brain_config.local.json (он в .gitignore): awsAccessKey, awsSecretKey, awsRegion.
    /// Запрос подписывается AWS Signature V4; ответ — PCM 16 кГц, собираем AudioClip без файлов.
    /// Одинаковые фразы кэшируются. Нет ключей или сети — откат на 8-битное бормотание.
    /// </summary>
    public class PollyVoice : MonoBehaviour, IVoice
    {
        public string AccessKey, SecretKey, Region = "eu-central-1", VoiceId = "Maxim";
        public GibberishVoice Fallback;
        public bool Muted { get; set; }
        AudioSource _src;
        readonly Dictionary<string, AudioClip> _cache = new Dictionary<string, AudioClip>();
        bool _broken;

        [Serializable] class Req { public string Text; public string VoiceId; public string OutputFormat = "pcm"; public string SampleRate = "16000"; public string Engine = "standard"; public string TextType = "text"; }

        void Awake()
        {
            _src = gameObject.AddComponent<AudioSource>();
            _src.playOnAwake = false;
        }

        public void Stop() => _src.Stop();

        public void Speak(string text, string mood)
        {
            if (Muted) return;
            if (_broken || string.IsNullOrEmpty(AccessKey) || string.IsNullOrEmpty(SecretKey)) { Fallback.Speak(text, mood); return; }
            StartCoroutine(Run(text, mood));
        }

        IEnumerator Run(string text, string mood)
        {
            string key = VoiceId + "|" + text;
            if (!_cache.TryGetValue(key, out var clip))
            {
                string body = JsonUtility.ToJson(new Req { Text = text, VoiceId = VoiceId });
                using (var req = Signed(body))
                {
                    yield return req.SendWebRequest();
                    if (req.result != UnityWebRequest.Result.Success)
                    {
                        Debug.LogWarning($"[Шарик] Polly: {req.responseCode} {req.error} {req.downloadHandler?.text}");
                        if (req.responseCode == 403 || req.responseCode == 400) _broken = true;   // ключи/регион не те — не долбим сервис
                        Fallback.Speak(text, mood); yield break;
                    }
                    clip = Pcm16ToClip(req.downloadHandler.data, 16000);
                    if (_cache.Count > 200) _cache.Clear();
                    _cache[key] = clip;
                }
            }
            _src.Stop();
            _src.clip = clip;
            _src.pitch = mood == "glitch" ? 0.8f : mood == "scared" ? 1.08f : 1f;   // почти ровно — это же бот
            _src.Play();
        }

        UnityWebRequest Signed(string body)
        {
            string host = $"polly.{Region}.amazonaws.com";
            var now = DateTime.UtcNow;
            string amzDate = now.ToString("yyyyMMdd'T'HHmmss'Z'"), date = now.ToString("yyyyMMdd");
            string signedHeaders = "content-type;host;x-amz-date";
            string canonical = "POST\n/v1/speech\n\n" +
                               $"content-type:application/json\nhost:{host}\nx-amz-date:{amzDate}\n\n" +
                               $"{signedHeaders}\n{Sha256Hex(body)}";
            string scope = $"{date}/{Region}/polly/aws4_request";
            string toSign = $"AWS4-HMAC-SHA256\n{amzDate}\n{scope}\n{Sha256Hex(canonical)}";
            byte[] k = Hmac(Encoding.UTF8.GetBytes("AWS4" + SecretKey), date);
            k = Hmac(k, Region); k = Hmac(k, "polly"); k = Hmac(k, "aws4_request");
            string sig = Hex(Hmac(k, toSign));

            var req = new UnityWebRequest($"https://{host}/v1/speech", "POST")
            {
                uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body)) { contentType = "application/json" },
                downloadHandler = new DownloadHandlerBuffer(),
                timeout = 15,
            };
            req.SetRequestHeader("Content-Type", "application/json");
            req.SetRequestHeader("X-Amz-Date", amzDate);
            req.SetRequestHeader("Authorization", $"AWS4-HMAC-SHA256 Credential={AccessKey}/{scope}, SignedHeaders={signedHeaders}, Signature={sig}");
            return req;
        }

        static byte[] Hmac(byte[] key, string data) { using (var h = new HMACSHA256(key)) return h.ComputeHash(Encoding.UTF8.GetBytes(data)); }
        static string Sha256Hex(string s) { using (var h = SHA256.Create()) return Hex(h.ComputeHash(Encoding.UTF8.GetBytes(s))); }
        static string Hex(byte[] b) { var sb = new StringBuilder(b.Length * 2); foreach (var x in b) sb.Append(x.ToString("x2")); return sb.ToString(); }

        static AudioClip Pcm16ToClip(byte[] pcm, int rate)
        {
            int n = pcm.Length / 2;
            var data = new float[n];
            for (int i = 0; i < n; i++) data[i] = (short)(pcm[i * 2] | (pcm[i * 2 + 1] << 8)) / 32768f;
            var clip = AudioClip.Create("polly", Math.Max(1, n), 1, rate, false);
            clip.SetData(data, 0);
            return clip;
        }
    }
}
