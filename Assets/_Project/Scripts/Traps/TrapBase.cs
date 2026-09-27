using UnityEngine;

namespace Sharik
{
    /// <summary>
    /// Базовая ловушка. Ловушками управляет ИГРОК (клик мышью или клавиши 1–9),
    /// шарик же видит их только как «вещи, которые почему-то срабатывают сами».
    /// </summary>
    public abstract class TrapBase : MonoBehaviour
    {
        public Vector2Int Cell;
        public int Hotkey;                  // назначает TrapController (1..9 для ловушек на экране)
        public bool Disabled;
        protected LevelRuntime Rt;
        protected SpriteRenderer Sr;
        float _readyAt;
        float _warn;

        /// <summary>Сколько ещё секунд враг «бодрствует» и действует сам.</summary>
        public float AwakeLeft { get; private set; }
        public bool Awake => AwakeLeft > 0f;
        public int Acts { get; private set; }
        public virtual float AwakeDuration => Tuning.AwakeTrap;
        /// <summary>Перезарядка в бодрствовании — свой ритм у каждой ловушки.</summary>
        protected virtual float AutoCooldown => Cooldown;
        /// <summary>Хочет ли проснувшийся враг действовать прямо сейчас (шарик рядом и т.п.).</summary>
        protected abstract bool WantsAutoAct(BallController ball);
        protected virtual float WarnTime => 0.35f;

        public abstract string Title { get; }          // «Шипы»
        public abstract float Cooldown { get; }
        public abstract bool IsDangerous { get; }      // опасна прямо сейчас?
        public abstract string DescribeState();        // для органов чувств шарика: «шипы спрятаны»
        protected abstract void OnTrigger();

        public bool Ready => !Disabled && Time.time >= _readyAt;
        public float CooldownLeft01 => Ready ? 0f : Mathf.Clamp01((_readyAt - Time.time) / CurrentCooldown);
        public float AwakeLeft01 => Mathf.Clamp01(AwakeLeft / AwakeDuration);
        public virtual Vector2 Center => LevelGrid.Center(Cell.x, Cell.y);
        float CurrentCooldown => Awake ? AutoCooldown : Cooldown;
        public SpriteRenderer Renderer => Sr;

        /// <summary>Точка над ловушкой для номера-подсказки (для боссов и пресса — над спрайтом).</summary>
        public Vector2 LabelPoint =>
            Sr != null && Sr.enabled ? new Vector2(Sr.bounds.center.x, Sr.bounds.max.y + 0.3f) : Center + Vector2.up * 0.9f;

        /// <summary>
        /// Действие игрока: разбудить врага (и сразу сработать, если заряжен).
        /// Повторный клик продлевает бодрствование. false — если ничего не произошло.
        /// </summary>
        public bool Trigger()
        {
            if (Disabled) return false;
            bool wasAwake = Awake;
            AwakeLeft = AwakeDuration;
            if (!wasAwake) { Acts = 0; Sfx.Play(Sfx.Id.Wake); }
            if (Time.time < _readyAt) return !wasAwake;
            Act();
            return true;
        }

        void Act()
        {
            Acts++;
            _warn = 0f;
            _readyAt = Time.time + CurrentCooldown;
            OnTrigger();
            GameEvents.RaiseTrapFired(this);
        }

        /// <summary>Автономия проснувшегося врага. Наследники с собственным Update вызывают base.Update().</summary>
        protected virtual void Update()
        {
            if (Disabled || !Awake) return;
            AwakeLeft -= Time.deltaTime;
            if (_warn > 0f)
            {
                _warn -= Time.deltaTime;
                if (_warn <= 0f) Act();
                return;
            }
            var gm = GameManager.I;
            var ball = gm != null ? gm.Ball : null;
            if (Time.time < _readyAt || ball == null || !ball.IsAlive || gm.InputLocked) return;
            if (!WantsAutoAct(ball)) return;
            // короткое предупреждение: дрожь перед действием — шарик и игрок успевают заметить
            _warn = Mathf.Max(0.01f, WarnTime);
            if (WarnTime > 0.05f && !(this is CrusherTrap) && !(this is BossTrap)) StartCoroutine(Shake(transform, WarnTime));
        }

        protected static bool Near(BallController b, Vector2 c, float dx, float dy = 4f) =>
            Mathf.Abs(b.transform.position.x - c.x) < dx && Mathf.Abs(b.transform.position.y - c.y) < dy;

        protected static T Spawn<T>(Transform parent, int x, int y, LevelRuntime rt, string sprite) where T : TrapBase
        {
            var sr = SpriteLib.Make(typeof(T).Name, parent, sprite, LevelGrid.Center(x, y), Order.Traps);
            var t = sr.gameObject.AddComponent<T>();
            t.Cell = new Vector2Int(x, y);
            t.Rt = rt;
            t.Sr = sr;
            rt.WorldSprites.Add(sr);
            return t;
        }

        /// <summary>Небольшая «отдача» спрайта при срабатывании — чтобы было видно, что это сделал игрок.</summary>
        protected System.Collections.IEnumerator Shake(Transform tr, float time = 0.15f)
        {
            var basePos = tr.localPosition;
            float t = 0;
            while (t < time)
            {
                t += Time.deltaTime;
                tr.localPosition = basePos + new Vector3(Random.Range(-1, 2), Random.Range(-1, 2), 0) / Tuning.PixelsPerUnit;
                yield return null;
            }
            tr.localPosition = basePos;
        }
    }
}
