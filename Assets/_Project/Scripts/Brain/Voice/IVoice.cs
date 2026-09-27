namespace Sharik
{
    /// <summary>Голос шарика. Реализации: GibberishVoice (8-битное бормотание, работает всегда) и PiperVoice (настоящий TTS).</summary>
    public interface IVoice
    {
        void Speak(string text, string mood);
        void Stop();
        bool Muted { get; set; }
    }
}
