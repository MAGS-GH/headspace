using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Windows.Media;

namespace Aandehul;

internal sealed class PebbleVoice
{
    private MediaPlayer? active;
    private readonly string clipsFolder = Path.Combine(AppContext.BaseDirectory, "Web", "voice");
    private readonly Envelope? envelope;
    private string? currentCue;
    internal bool Speaking { get; private set; }
    private sealed record Envelope(int StepMs, Dictionary<string, string> Clips);

    internal PebbleVoice()
    {
        try
        {
            string path = Path.Combine(clipsFolder, "mouth.json");
            if (File.Exists(path))
                envelope = JsonSerializer.Deserialize<Envelope>(File.ReadAllText(path), new JsonSerializerOptions(JsonSerializerDefaults.Web));
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException) { }
    }

    internal double MouthOpening
    {
        get
        {
            if (!Speaking || active == null || currentCue == null) return 0;
            double ms = active.Position.TotalMilliseconds;
            if (envelope is { StepMs: > 0, Clips: not null } && envelope.Clips.TryGetValue(currentCue, out var samples))
            {
                int i = (int)(ms / envelope.StepMs);
                return i >= 0 && i < samples.Length && samples[i] is >= '0' and <= '9' ? (samples[i] - '0') / 9.0 : 0;
            }
            return Math.Max(0, Math.Sin(ms * .021));
        }
    }

    internal void Say(string cue)
    {
        Stop();
        string clip = Path.Combine(clipsFolder, cue + ".mp3");
        if (!File.Exists(clip)) return;
        currentCue = cue;
        var player = new MediaPlayer { Volume = .78 };
        active = player;
        player.MediaOpened += (_, _) =>
        {
            if (active != player) return;
            Speaking = true;
            player.Play();
        };
        player.MediaEnded += (_, _) => { if (active == player) Stop(); };
        player.MediaFailed += (_, _) => { if (active == player) Stop(); };
        player.Open(new Uri(clip));
    }

    internal void Stop()
    {
        var player = active;
        active = null;
        currentCue = null;
        Speaking = false;
        player?.Close();
    }
}
