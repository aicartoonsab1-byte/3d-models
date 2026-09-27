using UnityEngine;

namespace Sharik
{
    /// <summary>Общий помощник: принадлежит ли коллайдер шарику.</summary>
    public static class BallHit
    {
        public static BallController Get(Collider2D c) => c != null ? c.GetComponentInParent<BallController>() : null;
    }

    public class ExitDoor : MonoBehaviour
    {
        bool _used;
        void OnTriggerEnter2D(Collider2D other)
        {
            var b = BallHit.Get(other);
            if (_used || b == null || !b.IsAlive) return;
            _used = true;
            GameManager.I.OnReachedExit(b);
        }
    }

    public class Checkpoint : MonoBehaviour
    {
        SpriteRenderer _sr;
        bool _on;
        void Awake() => _sr = GetComponent<SpriteRenderer>();
        void OnTriggerEnter2D(Collider2D other)
        {
            var b = BallHit.Get(other);
            if (_on || b == null || !b.IsAlive) return;
            _on = true;
            _sr.sprite = SpriteLib.Get("obj_checkpoint_on");
            b.SetRespawn(transform.position);
            Sfx.Play(Sfx.Id.Checkpoint);
            GameEvents.RaiseCheckpoint(transform.position);
        }
    }

    /// <summary>Осколок кода — сюжетная находка. Шарик читает его вслух.</summary>
    public class Fragment : MonoBehaviour
    {
        public string text;
        Vector3 _base;
        SpriteRenderer _sr;
        void Start() { _base = transform.localPosition; _sr = GetComponent<SpriteRenderer>(); }
        void Update()
        {
            float t = Time.time * 3f + _base.x;
            transform.localPosition = _base + new Vector3(0, Mathf.Round(Mathf.Sin(t) * 2f) / Tuning.PixelsPerUnit, 0);
            _sr.color = Random.value < 0.04f ? new Color(0.3f, 1f, 0.5f) : Color.white;   // мерцание-глитч
        }
        void OnTriggerEnter2D(Collider2D other)
        {
            var b = BallHit.Get(other);
            if (b == null || !b.IsAlive) return;
            Sfx.Play(Sfx.Id.Fragment);
            GameEvents.RaiseFragment(text);
            Destroy(gameObject);
        }
    }

    /// <summary>Рубильник в финале: шарик дотрагивается — начинается конец света.</summary>
    public class FinalSwitch : MonoBehaviour
    {
        bool _used;
        public SpriteRenderer Sr;
        public void Flip() { Sr.sprite = SpriteLib.Get("obj_switch_on"); }
        void OnTriggerEnter2D(Collider2D other)
        {
            var b = BallHit.Get(other);
            if (_used || b == null || !b.IsAlive) return;
            _used = true;
            GameManager.I.StartEnding(this, b);
        }
    }
}
