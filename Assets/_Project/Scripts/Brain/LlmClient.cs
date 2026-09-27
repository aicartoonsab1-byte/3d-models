using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace Sharik
{
    /// <summary>
    /// Клиент OpenAI-совместимого чата. Работает с бесплатными локальными нейросетями:
    /// Ollama (по умолчанию), LM Studio, llama.cpp server, а также с облачными API с бесплатным тарифом.
    /// </summary>
    public class LlmClient
    {
        readonly BrainConfig _cfg;
        int _fails;
        float _retryAt;
        public bool Busy { get; private set; }
        public string Status { get; private set; } = "не подключён";
        public bool Online { get; private set; }
        public string LastRequest = "", LastResponse = "";

        public LlmClient(BrainConfig cfg) { _cfg = cfg; }

        public bool CanAsk => _cfg.useLlm && !Busy && Time.time >= _retryAt;

        public IEnumerator Ask(string system, string user, Action<string> onOk)
        {
            Busy = true;
            var body = new StringBuilder();
            body.Append("{\"model\":").Append(Q(_cfg.model));
            body.Append(",\"stream\":false");
            body.Append(",\"temperature\":").Append(_cfg.temperature.ToString(System.Globalization.CultureInfo.InvariantCulture));
            body.Append(",\"max_tokens\":").Append(_cfg.maxTokens);
            if (_cfg.jsonMode) body.Append(",\"response_format\":{\"type\":\"json_object\"}");
            body.Append(",\"messages\":[{\"role\":\"system\",\"content\":").Append(Q(system))
                .Append("},{\"role\":\"user\",\"content\":").Append(Q(user)).Append("}]}");
            LastRequest = user;

            using (var req = new UnityWebRequest(_cfg.endpoint, "POST"))
            {
                req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body.ToString()));
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                if (!string.IsNullOrEmpty(_cfg.apiKey)) req.SetRequestHeader("Authorization", "Bearer " + _cfg.apiKey);
                req.timeout = Mathf.CeilToInt(_cfg.timeoutSeconds);
                yield return req.SendWebRequest();

                if (req.result != UnityWebRequest.Result.Success)
                {
                    _fails++;
                    Online = false;
                    Status = $"офлайн ({req.error})";
                    LastResponse = req.downloadHandler?.text ?? req.error;
                    // после серии ошибок не долбим сервер — пробуем раз в минуту
                    if (_fails >= 2) _retryAt = Time.time + 60f;
                }
                else
                {
                    _fails = 0;
                    Online = true;
                    Status = $"{_cfg.model} ✓";
                    LastResponse = req.downloadHandler.text;
                    string content = null;
                    try
                    {
                        var r = JsonUtility.FromJson<ChatResponse>(req.downloadHandler.text);
                        content = r?.choices != null && r.choices.Length > 0 ? r.choices[0].message.content : null;
                    }
                    catch (Exception e) { Debug.LogWarning("[Шарик] Не разобрал ответ нейросети: " + e.Message); }
                    if (!string.IsNullOrEmpty(content)) onOk(content);
                }
            }
            Busy = false;
        }

        static string Q(string s)
        {
            var sb = new StringBuilder("\"");
            foreach (var c in s ?? "")
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
            return sb.Append('"').ToString();
        }

        [Serializable] class ChatResponse { public Choice[] choices; }
        [Serializable] class Choice { public Msg message; }
        [Serializable] class Msg { public string content; }
    }

    /// <summary>Ответ «мозга» шарика.</summary>
    [Serializable]
    public class BrainReply
    {
        public string thought;
        public string say;
        public string action;
        public string mood;

        /// <summary>Достаёт JSON из ответа модели (модели любят добавлять текст, ```json и &lt;think&gt;).</summary>
        public static BrainReply Parse(string content)
        {
            if (string.IsNullOrEmpty(content)) return null;
            int think = content.IndexOf("</think>", StringComparison.Ordinal);
            if (think >= 0) content = content.Substring(think + 8);
            int a = content.IndexOf('{');
            int b = content.LastIndexOf('}');
            if (a >= 0 && b > a)
            {
                try
                {
                    var r = JsonUtility.FromJson<BrainReply>(content.Substring(a, b - a + 1));
                    if (r != null && (!string.IsNullOrEmpty(r.thought) || !string.IsNullOrEmpty(r.say))) return r;
                }
                catch { /* упадём ниже в «просто текст» */ }
            }
            var text = content.Trim().Trim('`', '"');
            if (text.Length == 0) return null;
            return new BrainReply { thought = text.Length > 120 ? text.Substring(0, 120) + "…" : text, action = "forward" };
        }
    }
}
