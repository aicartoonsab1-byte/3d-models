using System.Collections;
using UnityEngine;

namespace Sharik
{
    /// <summary>
    /// Внешний вид шарика: пластилиновое «желе» на пружине (squash &amp; stretch), лицо с эмоциями,
    /// пятнышки, которые крутятся при качении, лепёшка и сборка из кусочков.
    /// </summary>
    public class BallVisual : MonoBehaviour
    {
        Transform _pivot;           // точка у «ног» шарика — масштабируем относительно неё
        SpriteRenderer _body, _spots, _face, _pancake;
        Vector2 _scale = Vector2.one, _scaleVel;
        float _roll;
        string _mood = "neutral";
        float _moodUntil;
        bool _lookLeft;
        Vector2? _lookAt;           // куда смотреть (например, на курсор игрока)
        public string Mood => _mood;

        public static BallVisual Create(Transform ball)
        {
            var go = new GameObject("Visual");
            go.transform.SetParent(ball, false);
            var v = go.AddComponent<BallVisual>();
            v._pivot = new GameObject("Pivot").transform;
            v._pivot.SetParent(go.transform, false);
            v._pivot.localPosition = new Vector3(0, -Tuning.BallRadius, 0);
            var up = new Vector2(0, Tuning.BallRadius);
            v._body = SpriteLib.Make("Body", v._pivot, "ball_body", up, Order.Ball);
            v._spots = SpriteLib.Make("Spots", v._body.transform, "ball_spots", Vector2.zero, Order.Ball + 1);
            v._face = SpriteLib.Make("Face", v._pivot, "face_neutral", up, Order.Ball + 2);
            v._pancake = SpriteLib.Make("Pancake", go.transform, "ball_pancake", new Vector2(0, -Tuning.BallRadius + 4f / 16f), Order.Ball);
            v._pancake.enabled = false;
            return v;
        }

        // ------------------------------------------------------------ эмоции
        public void SetMood(string mood, float hold = 2.5f)
        {
            if (string.IsNullOrEmpty(mood)) return;
            _mood = mood;
            _moodUntil = Time.time + hold;
            _face.sprite = SpriteLib.Get("face_" + mood);
        }

        public void LookAt(Vector2? worldPoint) => _lookAt = worldPoint;

        // ------------------------------------------------------------ пружинка формы
        public void Squash(float amount, Vector2 normal)
        {
            amount = Mathf.Clamp01(amount);
            if (Mathf.Abs(normal.x) > 0.6f) _scale = new Vector2(1f - 0.45f * amount, 1f + 0.3f * amount);
            else _scale = new Vector2(1f + 0.5f * amount, 1f - 0.45f * amount);
            _scaleVel = Vector2.zero;
        }

        public void Stretch(float amount)
        {
            _scale = new Vector2(1f - 0.3f * amount, 1f + 0.4f * amount);
            _scaleVel = Vector2.zero;
        }

        public void Tick(Vector2 vel, bool grounded, BallState state)
        {
            // пружина масштаба: пластилин немного пружинит и затухает
            var k = 220f; var damp = 11f;
            var acc = (Vector2.one - _scale) * k - _scaleVel * damp;
            _scaleVel += acc * Time.deltaTime;
            _scale += _scaleVel * Time.deltaTime;
            if (state == BallState.Alive || state == BallState.Cutscene)
            {
                // лёгкое вытягивание по скорости в воздухе
                float stretch = grounded ? 0f : Mathf.Clamp(Mathf.Abs(vel.y) / 30f, 0f, 0.18f);
                _pivot.localScale = new Vector3(_scale.x * (1f - stretch * 0.6f), _scale.y * (1f + stretch), 1f);
            }

            // качение: пятнышки крутятся, пиксельно шагами по 22.5°
            _roll -= vel.x / Tuning.BallRadius * Mathf.Rad2Deg * Time.deltaTime;
            _spots.transform.localRotation = Quaternion.Euler(0, 0, Mathf.Round(_roll / 22.5f) * 22.5f);

            // взгляд
            if (_lookAt.HasValue) _lookLeft = _lookAt.Value.x < transform.position.x;
            else if (Mathf.Abs(vel.x) > 0.3f) _lookLeft = vel.x < 0;
            _face.flipX = _lookLeft;

            if (Time.time > _moodUntil && state == BallState.Alive && _mood != "neutral" && _mood != "glitch")
            {
                _mood = Mathf.Abs(vel.x) > 4.5f ? "determined" : "neutral";
                _face.sprite = SpriteLib.Get("face_" + _mood);
            }
        }

        // ------------------------------------------------------------ лепёшка
        public void ShowPancake(Vector2 normal)
        {
            _pivot.gameObject.SetActive(false);
            _pancake.enabled = true;
            _pancake.transform.localRotation = Quaternion.FromToRotation(Vector2.up, normal);
            _pancake.transform.localPosition = -(Vector3)normal.normalized * (Tuning.BallRadius - 0.25f);
            _pancake.transform.localScale = new Vector3(0.6f, 2.2f, 1f);
            StartCoroutine(PancakeSettle());
        }

        IEnumerator PancakeSettle()
        {
            // «шмяк»: лепёшка растекается и чуть подрагивает
            float t = 0;
            while (t < 0.25f)
            {
                t += Time.deltaTime;
                float e = 1f - Mathf.Pow(1f - t / 0.25f, 3);
                _pancake.transform.localScale = new Vector3(Mathf.Lerp(0.6f, 1.08f, e), Mathf.Lerp(2.2f, 0.9f, e), 1);
                yield return null;
            }
            _pancake.transform.localScale = Vector3.one;
        }

        public void Hide()
        {
            _pivot.gameObject.SetActive(false);
            _pancake.enabled = false;
        }

        /// <summary>Сборка обратно в шар: кусочки пластилина слетаются, шар «надувается» с пружинкой.</summary>
        public IEnumerator Reform(bool fromScratch)
        {
            _pancake.enabled = false;
            _pancake.transform.localRotation = Quaternion.identity;
            var basePos = (Vector2)transform.position;
            const int n = 7;
            var blobs = new SpriteRenderer[n];
            var from = new Vector2[n];
            for (int i = 0; i < n; i++)
            {
                float a = i / (float)n * Mathf.PI * 2f + Random.value * 0.5f;
                from[i] = fromScratch
                    ? new Vector2(Mathf.Cos(a), Mathf.Abs(Mathf.Sin(a))) * Random.Range(1.2f, 2.2f)
                    : new Vector2(Mathf.Cos(a) * Random.Range(0.4f, 0.9f), -0.35f);
                blobs[i] = SpriteLib.Make("Blob", transform, "ball_blob", from[i], Order.Ball + 3);
            }
            Sfx.Play(Sfx.Id.Reform);
            float t = 0, dur = 0.45f;
            while (t < dur)
            {
                t += Time.deltaTime;
                float e = t / dur;
                e = e * e * (3f - 2f * e);
                for (int i = 0; i < n; i++)
                {
                    var p = Vector2.Lerp(from[i], Vector2.zero, e) + Vector2.up * Mathf.Sin(e * Mathf.PI) * 0.4f;
                    blobs[i].transform.localPosition = new Vector3(Mathf.Round(p.x * 16) / 16, Mathf.Round(p.y * 16) / 16, 0);
                }
                yield return null;
            }
            foreach (var b in blobs) Destroy(b.gameObject);

            _pivot.gameObject.SetActive(true);
            _scale = new Vector2(1.9f, 0.25f);   // из лепёшки — в шар, с перелётом и колебаниями
            _scaleVel = new Vector2(0, 9f);
            SetMood("dizzy", 1.2f);
            float w = 0;
            while (w < 0.5f)
            {
                w += Time.deltaTime;
                var acc = (Vector2.one - _scale) * 260f - _scaleVel * 9f;
                _scaleVel += acc * Time.deltaTime;
                _scale += _scaleVel * Time.deltaTime;
                _pivot.localScale = new Vector3(_scale.x, _scale.y, 1);
                yield return null;
            }
        }

        /// <summary>Финал: шарик рассыпается на пиксели и исчезает.</summary>
        public IEnumerator Dissolve()
        {
            Hide();
            const int n = 24;
            var bits = new SpriteRenderer[n];
            var vel = new Vector2[n];
            for (int i = 0; i < n; i++)
            {
                bits[i] = SpriteLib.Make("Bit", transform, "fx_pixel", Random.insideUnitCircle * 0.4f, Order.Fx);
                bits[i].color = i % 3 == 0 ? new Color32(0xff, 0xc8, 0x8a, 255) : new Color32(0xf2, 0x8c, 0x3c, 255);
                vel[i] = new Vector2(Random.Range(-0.6f, 0.6f), Random.Range(0.4f, 1.6f));
            }
            float t = 0;
            while (t < 3f)
            {
                t += Time.deltaTime;
                for (int i = 0; i < n; i++)
                {
                    bits[i].transform.localPosition += (Vector3)(vel[i] * Time.deltaTime);
                    var c = bits[i].color; c.a = 1f - t / 3f; bits[i].color = c;
                }
                yield return null;
            }
            foreach (var b in bits) Destroy(b.gameObject);
        }
    }
}
