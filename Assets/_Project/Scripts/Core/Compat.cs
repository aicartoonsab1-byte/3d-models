using UnityEngine;

namespace Sharik
{
    /// <summary>Сглаживает различия API между Unity 2022 и Unity 6.</summary>
    public static class Compat
    {
        public static Vector2 Vel(this Rigidbody2D rb)
        {
#if UNITY_6000_0_OR_NEWER
            return rb.linearVelocity;
#else
            return rb.velocity;
#endif
        }

        public static void SetVel(this Rigidbody2D rb, Vector2 v)
        {
#if UNITY_6000_0_OR_NEWER
            rb.linearVelocity = v;
#else
            rb.velocity = v;
#endif
        }

        public static T FindAny<T>() where T : Object
        {
            return Object.FindFirstObjectByType<T>();
        }
    }
}
