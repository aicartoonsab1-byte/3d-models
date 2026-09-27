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

        public abstract string Title { get; }          // «Шипы»
        public abstract float Cooldown { get; }
        public abstract bool IsDangerous { get; }      // опасна прямо сейчас?
        public abstract string DescribeState();        // для органов чувств шарика: «шипы спрятаны»
        protected abstract void OnTrigger();

        public bool Ready => !Disabled && Time.time >= _readyAt;
        public float CooldownLeft01 => Ready ? 0f : Mathf.Clamp01((_readyAt - Time.time) / Cooldown);
        public Vector2 Center => LevelGrid.Center(Cell.x, Cell.y);
        public SpriteRenderer Renderer => Sr;

        /// <summary>Точка над ловушкой для номера-подсказки (для боссов и пресса — над спрайтом).</summary>
        public Vector2 LabelPoint =>
            Sr != null && Sr.enabled ? new Vector2(Sr.bounds.center.x, Sr.bounds.max.y + 0.3f) : Center + Vector2.up * 0.9f;

        public bool Trigger()
        {
            if (!Ready) return false;
            _readyAt = Time.time + Cooldown;
            OnTrigger();
            GameEvents.RaiseTrapFired(this);
            return true;
        }

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
