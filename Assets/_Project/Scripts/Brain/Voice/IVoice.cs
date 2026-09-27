namespace Sharik
{
    /// <summary>Голос шарика. Реализации: GibberishVoice (8-битное бормотание, работает всегда), PiperVoice (Piper TTS), SystemVoice (голос Windows, напр. «бот Максим»), PollyVoice (Amazon Polly Maxim).</summary>
    public interface IVoice
    {
        void Speak(string text, string mood);
        void Stop();
        bool Muted { get; set; }
    }
}
