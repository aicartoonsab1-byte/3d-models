using System;
using UnityEngine;

namespace Sharik
{
    public enum DeathKind { None, Pit, Spikes, Crushed, HardLanding }

    /// <summary>Шина событий — мозг шарика, звук и HUD подписываются сюда.</summary>
    public static class GameEvents
    {
        public static event Action<TrapBase> TrapFired;             // игрок включил ловушку
        public static event Action<DeathKind, bool> BallSplat;      // (причина, погиб ли)
        public static event Action BallReformed;
        public static event Action<string> FragmentFound;
        public static event Action<Vector2> CheckpointReached;
        public static event Action LevelFinished;
        public static event Action BallJumped;
        public static event Action<Vector2> BallLanded;
        public static event Action<string> World;                   // «блок рассыпался», «портал» и т.п.

        public static void RaiseTrapFired(TrapBase t) => TrapFired?.Invoke(t);
        public static void RaiseSplat(DeathKind k, bool died) => BallSplat?.Invoke(k, died);
        public static void RaiseReformed() => BallReformed?.Invoke();
        public static void RaiseFragment(string text) => FragmentFound?.Invoke(text);
        public static void RaiseCheckpoint(Vector2 p) => CheckpointReached?.Invoke(p);
        public static void RaiseLevelFinished() => LevelFinished?.Invoke();
        public static void RaiseJumped() => BallJumped?.Invoke();
        public static void RaiseLanded(Vector2 v) => BallLanded?.Invoke(v);
        public static void RaiseWorld(string what) => World?.Invoke(what);

        public static void Clear()
        {
            TrapFired = null; BallSplat = null; BallReformed = null; FragmentFound = null;
            CheckpointReached = null; LevelFinished = null; BallJumped = null; BallLanded = null; World = null;
        }
    }
}
