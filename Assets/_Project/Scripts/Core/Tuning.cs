namespace Sharik
{
    /// <summary>
    /// Все «магические числа» игры в одном месте.
    /// Физика ДОЛЖНА совпадать с Tools/levels/levellib.py — по ней валидатор проверяет проходимость уровней.
    /// </summary>
    public static class Tuning
    {
        // --- пиксели
        public const int PixelsPerUnit = 16;          // 1 тайл = 16×16 px = 1 юнит
        public const int ReferenceHeightPx = 180;     // «экран NES»: 320×180
        public const float OrthoSize = ReferenceHeightPx / 2f / PixelsPerUnit;

        // --- физика шарика (синхронно с levellib.py)
        public const float GravityScale = 3f;         // × Physics2D.gravity (-9.81)
        public const float RunSpeed = 6f;
        public const float JumpSpeed = 13.5f;
        public const float BallRadius = 0.45f;
        public const float SplatSpeed = 17f;          // удар сильнее → лепёшка
        public const float GroundAccel = 38f;
        public const float AirAccel = 16f;
        public const float CoyoteTime = 0.1f;
        public const float KillY = -3f;               // ниже — упал в бездну

        // --- ловушки
        public const float SpikesActive = 1.6f, SpikesCooldown = 3f;
        public const float CrusherHold = 0.6f, CrusherCooldown = 3.5f, CrusherFallSpeed = 22f, CrusherRiseSpeed = 3f;
        public const float TrapdoorOpen = 1.6f, TrapdoorCooldown = 3f;
        public const float FanActive = 2.5f, FanCooldown = 4f, FanForce = 75f, FanHeight = 5f;
        public const float SpringLaunchSpeed = 22f, SpringCooldown = 1.5f;

        // --- мозг
        public const float ReformTime = 1.3f;
        public const float RespawnDelay = 1.1f;
        public const float VoiceCharsPerSecond = 20f;
    }
}
