using System.Collections;
using UnityEngine;

namespace Sharik
{
    public enum BallState { Alive, Splatted, Dead, Reforming, Cutscene, Gone }

    /// <summary>
    /// Тело шарика: физика качения и прыжков, лепёшка, смерть и сборка обратно.
    /// Решения «куда катиться» принимает BallBrain (нейросеть) + Navigator (инстинкт).
    /// </summary>
    [RequireComponent(typeof(Rigidbody2D))]
    public class BallController : MonoBehaviour
    {
        public Rigidbody2D Body { get; private set; }
        public BallVisual Visual { get; private set; }
        public BallState State { get; private set; } = BallState.Alive;
        public bool IsAlive => State == BallState.Alive;
        public bool Grounded { get; private set; }
        public int Deaths, Splats;

        // --- команды от мозга
        [HideInInspector] public float MoveInput;       // -1..1
        [HideInInspector] public float SpeedMul = 1f;

        Vector2 _respawn;
        float _lastGrounded = -10f;
        bool _jumpQueued;
        float _jumpVx;
        float _jumpMul = 1f;
        bool _aimedJump;
        float _airborneSince;
        float _peakFallSpeed;
        CircleCollider2D _col;
        readonly ContactPoint2D[] _contacts = new ContactPoint2D[8];

        public static BallController Create(Vector2 pos)
        {
            var go = new GameObject("Шарик");
            go.transform.position = pos;
            var rb = go.AddComponent<Rigidbody2D>();
            rb.gravityScale = Tuning.GravityScale;
            rb.freezeRotation = true;                       // вращение рисуем сами (пятнышки)
            rb.interpolation = RigidbodyInterpolation2D.Interpolate;
            rb.collisionDetectionMode = CollisionDetectionMode2D.Continuous;
            rb.sleepMode = RigidbodySleepMode2D.NeverSleep;     // иначе стоящий шарик «не чувствует» выдвинутые шипы
            var col = go.AddComponent<CircleCollider2D>();
            col.radius = Tuning.BallRadius;
            col.sharedMaterial = new PhysicsMaterial2D("Plasticine") { friction = 0.2f, bounciness = 0f };
            var b = go.AddComponent<BallController>();
            b._respawn = pos;
            return b;
        }

        void Awake()
        {
            Body = GetComponent<Rigidbody2D>();
            _col = GetComponent<CircleCollider2D>();
            Visual = BallVisual.Create(transform);
        }

        public void SetRespawn(Vector2 p) => _respawn = new Vector2(p.x, Mathf.Floor(p.y) + Tuning.BallRadius + 0.02f);

        /// <summary>Прыжок. vx == null — с текущей скоростью, иначе «прицельный» с заданной.
        /// power — доля полной силы прыжка (под низким потолком прыгаем слабее).</summary>
        public void Jump(float? vx = null, float power = 1f)
        {
            _jumpQueued = true;
            _jumpMul = Mathf.Clamp(power, 0.4f, 1f);
            _aimedJump = vx.HasValue;
            _jumpVx = vx ?? Body.Vel().x;
        }

        public bool CanJump => IsAlive && Time.time - _lastGrounded <= Tuning.CoyoteTime;

        public void Launch(Vector2 v)
        {
            Body.SetVel(v);
            _aimedJump = false;
            Visual.Stretch(0.6f);
            Grounded = false;
        }

        void FixedUpdate()
        {
            UpdateGrounded();
            if (State != BallState.Alive) return;

            var v = Body.Vel();
            if (!(_aimedJump && !Grounded))
            {
                float target = Mathf.Clamp(MoveInput, -1f, 1f) * Tuning.RunSpeed * SpeedMul;
                float acc = Grounded ? Tuning.GroundAccel : Tuning.AirAccel;
                v.x = Mathf.MoveTowards(v.x, target, acc * Time.fixedDeltaTime);
            }
            if (_jumpQueued)
            {
                _jumpQueued = false;
                if (CanJump)
                {
                    v.y = Tuning.JumpSpeed * _jumpMul;
                    v.x = Mathf.Clamp(_jumpVx, -Tuning.RunSpeed * 1.25f, Tuning.RunSpeed * 1.25f);
                    _lastGrounded = -10f;
                    Grounded = false;
                    _airborneSince = Time.time;
                    Visual.Stretch(0.35f);
                    Sfx.Play(Sfx.Id.Jump);
                    GameEvents.RaiseJumped();
                }
                else _aimedJump = false;
            }
            Body.SetVel(v);
            if (!Grounded) _peakFallSpeed = Mathf.Max(_peakFallSpeed, -v.y);

            if (transform.position.y < Tuning.KillY) Die(DeathKind.Pit);
        }

        void UpdateGrounded()
        {
            bool g = false;
            int n = _col.GetContacts(_contacts);
            for (int i = 0; i < n; i++)
                if (_contacts[i].normal.y > 0.55f && !_contacts[i].collider.isTrigger) { g = true; break; }
            if (g)
            {
                _lastGrounded = Time.time;
                if (!Grounded) _aimedJump = false;
            }
            else if (Grounded) _airborneSince = Time.time;
            Grounded = g;
        }

        void OnCollisionEnter2D(Collision2D c)
        {
            if (State != BallState.Alive) return;
            // пресс (кинематическое тело) сам решает, когда делать лепёшку
            if (c.rigidbody != null && c.rigidbody.bodyType == RigidbodyType2D.Kinematic) return;
            float impact = 0f;
            Vector2 normal = Vector2.up;
            for (int i = 0; i < c.contactCount; i++)
            {
                var cp = c.GetContact(i);
                float s = Vector2.Dot(c.relativeVelocity, cp.normal);
                if (Mathf.Abs(s) > Mathf.Abs(impact)) { impact = Mathf.Abs(s); normal = cp.normal; }
            }
            impact = Mathf.Max(impact, normal.y > 0.5f ? _peakFallSpeed : 0f);
            _peakFallSpeed = 0f;

            if (impact > Tuning.SplatSpeed)
            {
                // лепёшка об землю или об потолок/стену
                StartCoroutine(SplatRoutine(DeathKind.HardLanding, normal, false));
            }
            else if (impact > 4f)
            {
                Visual.Squash(Mathf.InverseLerp(4f, Tuning.SplatSpeed, impact), normal);
                Sfx.Play(Sfx.Id.Land, Mathf.InverseLerp(4f, Tuning.SplatSpeed, impact));
                if (normal.y > 0.5f) GameEvents.RaiseLanded(c.relativeVelocity);
            }
        }

        // ------------------------------------------------------------------ лепёшка / смерть
        /// <summary>Раздавлен прессом: лепёшка на месте, потом собирается обратно.</summary>
        public void Squash(float crusherX)
        {
            if (!IsAlive) return;
            StartCoroutine(SplatRoutine(DeathKind.Crushed, Vector2.up, false));
        }

        public void Die(DeathKind kind)
        {
            if (!IsAlive) return;
            StartCoroutine(SplatRoutine(kind, Vector2.up, true));
        }

        IEnumerator SplatRoutine(DeathKind kind, Vector2 normal, bool dies)
        {
            State = dies ? BallState.Dead : BallState.Splatted;
            Splats++;
            if (dies) Deaths++;
            _aimedJump = false; _jumpQueued = false; MoveInput = 0;
            Body.SetVel(Vector2.zero);
            Body.simulated = false;

            if (kind == DeathKind.Pit)
            {
                Sfx.Play(Sfx.Id.Fall);
                Visual.Hide();
            }
            else
            {
                Sfx.Play(Sfx.Id.Splat);
                CameraRig.Shake(0.12f, 0.1f);
                // «прилипаем» к поверхности, об которую ударились
                if (kind == DeathKind.Crushed || normal.y > 0.5f)
                    transform.position = new Vector3(transform.position.x, Mathf.Floor(transform.position.y - Tuning.BallRadius + 0.3f) + 0.02f, 0);
                Visual.ShowPancake(normal);
            }
            GameEvents.RaiseSplat(kind, dies);

            yield return new WaitForSeconds(dies ? Tuning.RespawnDelay : Tuning.ReformTime);

            if (dies)
            {
                transform.position = _respawn;
                Body.position = _respawn;
            }
            else
            {
                transform.position = new Vector3(transform.position.x, Mathf.Floor(transform.position.y) + Tuning.BallRadius + 0.02f, 0);
                Body.position = transform.position;
            }

            State = BallState.Reforming;
            yield return Visual.Reform(dies);        // собирается из кусочков пластилина
            Body.simulated = true;
            Body.SetVel(Vector2.zero);
            _peakFallSpeed = 0f;
            State = BallState.Alive;
            GameEvents.RaiseReformed();
        }

        // ------------------------------------------------------------------ катсцены
        public void Freeze()
        {
            State = BallState.Cutscene;
            MoveInput = 0;
            Body.SetVel(new Vector2(0, Body.Vel().y));
        }

        public void Unfreeze() { if (State == BallState.Cutscene) State = BallState.Alive; }

        public void Vanish() { State = BallState.Gone; Body.simulated = false; }

        void Update()
        {
            Visual.Tick(Body.Vel(), Grounded, State);
        }
    }
}
