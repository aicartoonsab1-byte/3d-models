using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace Sharik
{
    /// <summary>
    /// Ввод, который работает и со старым Input Manager, и с новым Input System
    /// (в Unity 6 по умолчанию включён новый).
    /// </summary>
    public static class InputShim
    {
        public enum K { R, N, P, M, Escape, F1, F2, F3, Space, Enter, D1, D2, D3, D4, D5, D6, D7, D8, D9 }

        public static bool Down(K k)
        {
#if ENABLE_INPUT_SYSTEM
            var kb = Keyboard.current;
            if (kb == null) return false;
            switch (k)
            {
                case K.R: return kb.rKey.wasPressedThisFrame;
                case K.N: return kb.nKey.wasPressedThisFrame;
                case K.P: return kb.pKey.wasPressedThisFrame;
                case K.M: return kb.mKey.wasPressedThisFrame;
                case K.Escape: return kb.escapeKey.wasPressedThisFrame;
                case K.F1: return kb.f1Key.wasPressedThisFrame;
                case K.F2: return kb.f2Key.wasPressedThisFrame;
                case K.F3: return kb.f3Key.wasPressedThisFrame;
                case K.Space: return kb.spaceKey.wasPressedThisFrame;
                case K.Enter: return kb.enterKey.wasPressedThisFrame;
                case K.D1: return kb.digit1Key.wasPressedThisFrame;
                case K.D2: return kb.digit2Key.wasPressedThisFrame;
                case K.D3: return kb.digit3Key.wasPressedThisFrame;
                case K.D4: return kb.digit4Key.wasPressedThisFrame;
                case K.D5: return kb.digit5Key.wasPressedThisFrame;
                case K.D6: return kb.digit6Key.wasPressedThisFrame;
                case K.D7: return kb.digit7Key.wasPressedThisFrame;
                case K.D8: return kb.digit8Key.wasPressedThisFrame;
                case K.D9: return kb.digit9Key.wasPressedThisFrame;
            }
            return false;
#elif ENABLE_LEGACY_INPUT_MANAGER
            switch (k)
            {
                case K.R: return Input.GetKeyDown(KeyCode.R);
                case K.N: return Input.GetKeyDown(KeyCode.N);
                case K.P: return Input.GetKeyDown(KeyCode.P);
                case K.M: return Input.GetKeyDown(KeyCode.M);
                case K.Escape: return Input.GetKeyDown(KeyCode.Escape);
                case K.F1: return Input.GetKeyDown(KeyCode.F1);
                case K.F2: return Input.GetKeyDown(KeyCode.F2);
                case K.F3: return Input.GetKeyDown(KeyCode.F3);
                case K.Space: return Input.GetKeyDown(KeyCode.Space);
                case K.Enter: return Input.GetKeyDown(KeyCode.Return);
                default:
                    return Input.GetKeyDown(KeyCode.Alpha1 + (k - K.D1));
            }
#else
            return false;
#endif
        }

        public static int DigitDown()
        {
            for (int i = 0; i < 9; i++)
                if (Down(K.D1 + i)) return i + 1;
            return 0;
        }

        public static bool AnyKeyDown()
        {
#if ENABLE_INPUT_SYSTEM
            return (Keyboard.current != null && Keyboard.current.anyKey.wasPressedThisFrame) || ClickDown();
#elif ENABLE_LEGACY_INPUT_MANAGER
            return Input.anyKeyDown;
#else
            return false;
#endif
        }

        public static bool ClickDown()
        {
#if ENABLE_INPUT_SYSTEM
            return Mouse.current != null && Mouse.current.leftButton.wasPressedThisFrame;
#elif ENABLE_LEGACY_INPUT_MANAGER
            return Input.GetMouseButtonDown(0);
#else
            return false;
#endif
        }

        /// <summary>Позиция мыши в пикселях экрана (0,0 — левый нижний угол).</summary>
        public static Vector2 MousePos()
        {
#if ENABLE_INPUT_SYSTEM
            return Mouse.current != null ? Mouse.current.position.ReadValue() : Vector2.zero;
#elif ENABLE_LEGACY_INPUT_MANAGER
            return Input.mousePosition;
#else
            return Vector2.zero;
#endif
        }
    }
}
