// GOALS.md §38e (D8): what the rest timer does when the time is up — three short beeps and a vibration. Both are best
// effort: a browser may refuse sound until the person has tapped something (so the AudioContext is made inside the
// "Descansar" tap) and many desktops have no vibration motor. Neither failing may break the screen.

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** Call from the tap that starts the timer; null when the browser has no Web Audio. */
export function createAudio(): AudioContext | null {
  try {
    const Context =
      window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!Context) return null;
    const context = new Context();
    void context.resume?.();
    return context;
  } catch {
    return null;
  }
}

export function alertRestOver(audio: AudioContext | null): void {
  try {
    navigator.vibrate?.([250, 120, 250, 120, 250]);
  } catch {
    /* no vibration here */
  }
  if (!audio) return;
  try {
    const start = audio.currentTime + 0.02;
    for (let i = 0; i < 3; i++) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.value = 0.2;
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(start + i * 0.3);
      oscillator.stop(start + i * 0.3 + 0.18);
    }
  } catch {
    /* no sound here */
  }
}
