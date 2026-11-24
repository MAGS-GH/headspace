using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;

namespace Aandehul;

internal sealed record PebbleSession(string ExerciseId, string StartedAt, string FinishedAt, int Seconds, bool Completed);

internal sealed class PebbleHistory
{
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly string path = Path.Combine(App.DataFolder, "pebble-sessions.json");
    private readonly List<PebbleSession> pending;
    internal IReadOnlyList<PebbleSession> Pending => pending;
    internal event Action<PebbleSession>? Added;

    internal PebbleHistory()
    {
        try
        {
            pending = File.Exists(path) ? JsonSerializer.Deserialize<List<PebbleSession>>(File.ReadAllText(path), Json) ?? [] : [];
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException) { pending = []; }
    }

    internal void Add(PebbleSession session)
    {
        pending.Add(session);
        Save();
        Added?.Invoke(session);
    }

    internal void Acknowledge(string startedAt)
    {
        if (pending.RemoveAll(session => session.StartedAt == startedAt) > 0) Save();
    }

    private void Save()
    {
        try
        {
            Directory.CreateDirectory(App.DataFolder);
            File.WriteAllText(path + ".tmp", JsonSerializer.Serialize(pending, Json));
            File.Move(path + ".tmp", path, overwrite: true);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { }
    }
}
