using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Threading;
using Drawing = System.Drawing;
using Forms = System.Windows.Forms;

namespace Aandehul;

public partial class Companion : Window
{
    private const int Duration = 60;
    private readonly Action openStudio;
    private readonly Action quit;
    private readonly Action<PebbleSession> saveSession;
    private readonly Stopwatch elapsed = new();
    private readonly DispatcherTimer tick = new();
    private readonly Stopwatch reaction = Stopwatch.StartNew();
    private readonly PebbleVoice voice = new();
    private readonly string positionFile = Path.Combine(App.DataFolder, "pebble-position.json");
    private readonly string preferencesFile = Path.Combine(App.DataFolder, "pebble-preferences.json");
    private Point? press;
    private bool inSession;
    private bool finished;
    private bool greeting;
    private int lastPhase = -1;
    private DateTimeOffset startedAt;
    internal bool AllowClose { get; set; }
    private sealed record Preferences(bool Voice, bool ReducedMotion);

    internal Companion(Action openStudio, Action quit, Action<PebbleSession> saveSession)
    {
        this.openStudio = openStudio;
        this.quit = quit;
        this.saveSession = saveSession;
        InitializeComponent();
        RestorePreferences();
        SourceInitialized += (_, _) => RestorePosition();
        Closing += OnClosing;
        tick.Tick += (_, _) => RenderBreath();
        IsVisibleChanged += (_, _) =>
        {
            if (!IsVisible) voice.Stop();
            RenderBreath();
        };
        RenderBreath();
    }

    internal void StartSession()
    {
        if (inSession) StopSession(false);
        inSession = true;
        finished = false;
        greeting = false;
        lastPhase = -1;
        reaction.Restart();
        startedAt = DateTimeOffset.UtcNow;
        elapsed.Restart();
        RenderBreath();
    }

    private void Toggle()
    {
        if (!inSession)
        {
            StartSession();
            return;
        }
        if (elapsed.IsRunning)
        {
            elapsed.Stop();
            Say("pause");
        }
        else
        {
            elapsed.Start();
            lastPhase = -1;
        }
        reaction.Restart();
        RenderBreath();
    }

    private void StopSession(bool complete)
    {
        int seconds = Math.Min(Duration, (int)elapsed.Elapsed.TotalSeconds);
        if (inSession && seconds > 0)
            saveSession(new PebbleSession("rolig-vejrtraekning", startedAt.ToString("O"), DateTimeOffset.UtcNow.ToString("O"), seconds, complete || seconds == Duration));
        voice.Stop();
        elapsed.Reset();
        inSession = false;
        finished = complete;
        reaction.Restart();
        if (complete) Say("complete");
        RenderBreath();
    }

    private void RenderBreath()
    {
        double seconds = elapsed.Elapsed.TotalSeconds;
        if (inSession && seconds >= Duration)
        {
            StopSession(true);
            return;
        }
        double cycle = seconds % 8;
        bool inhale = cycle < 4;
        double fill = inhale ? cycle / 4 : (8 - cycle) / 4;
        int phase = (int)(seconds / 4);
        if (inSession && elapsed.IsRunning && phase != lastPhase)
        {
            lastPhase = phase;
            Say(inhale ? "inhale" : "exhale");
        }
        double sinceReaction = reaction.Elapsed.TotalSeconds;
        if (greeting && sinceReaction >= 6) greeting = false;
        var mood = inSession
            ? (!elapsed.IsRunning ? PebbleMood.Pause : inhale ? PebbleMood.Inhale : PebbleMood.Exhale)
            : finished ? PebbleMood.Finished : greeting ? PebbleMood.Greeting : PebbleMood.Rest;
        bool animate = IsVisible && SystemParameters.ClientAreaAnimation && !MotionMenu.IsChecked;
        Portrait.Pose(mood, fill, sinceReaction, seconds, animate, voice.Speaking, voice.MouthOpening);
        string words = mood switch
        {
            PebbleMood.Greeting => "Hej med dig. Skal vi tage en lille pause sammen?",
            PebbleMood.Inhale => "Træk vejret ind.",
            PebbleMood.Exhale => "Pust langsomt ud.",
            PebbleMood.Pause => "Vi holder en lille pause.",
            PebbleMood.Finished => "Tak for stunden. Tag roen med dig.",
            _ => "Skal vi trække vejret sammen?"
        };
        if (SpeechBubble.Text != words) SpeechBubble.Text = words;
        string label = !inSession ? (finished ? "Et minut mere?" : "Tag en rolig pause")
            : !elapsed.IsRunning ? "Fortsæt pausen"
            : $"{(inhale ? "Ånd ind" : "Ånd ud")} · {Math.Ceiling((inhale ? 4 : 8) - cycle)} sek.";
        if (!Equals(SessionButton.Content, label)) SessionButton.Content = label;
        SessionButton.ToolTip = !inSession ? "Start ét minut med Pebble"
            : elapsed.IsRunning ? "Sæt pausen på hold" : "Fortsæt vejrtrækningen";
        bool reacting = (mood is PebbleMood.Greeting or PebbleMood.Pause or PebbleMood.Finished) && sinceReaction < 2;
        bool idleGlance = mood == PebbleMood.Rest && animate;
        double glance = sinceReaction % PebblePortrait.GlancePeriod;
        bool moving = animate && (elapsed.IsRunning || reacting || voice.Speaking || idleGlance && glance < PebblePortrait.GlanceDuration);
        bool update = elapsed.IsRunning || IsVisible && (greeting || reacting || voice.Speaking || idleGlance);
        // A resting companion sleeps between glances. A hidden one only checks the session clock.
        double delayMs = !IsVisible ? 1000 : moving ? 32 : idleGlance ? (PebblePortrait.GlancePeriod - glance) * 1000 : 200;
        var interval = TimeSpan.FromMilliseconds(Math.Max(16, delayMs));
        if (tick.Interval != interval) tick.Interval = interval;
        tick.IsEnabled = update && !AllowClose;
    }

    private void OptionsClick(object sender, RoutedEventArgs e)
    {
        Options.PlacementTarget = (UIElement)sender;
        Options.Placement = PlacementMode.Top;
        Options.IsOpen = true;
    }

    private void OptionsOpened(object sender, RoutedEventArgs e)
    {
        SessionMenu.Header = !inSession ? "Træk vejret i ét minut"
            : elapsed.IsRunning ? "Sæt pausen på hold" : "Fortsæt pausen";
        EndMenu.Visibility = inSession ? Visibility.Visible : Visibility.Collapsed;
        GreetMenu.IsEnabled = !inSession;
    }

    private void ToggleClick(object sender, RoutedEventArgs e) => Toggle();
    private void OpenStudioClick(object sender, RoutedEventArgs e) => openStudio();
    private void EndClick(object sender, RoutedEventArgs e) => StopSession(false);
    private void HideClick(object sender, RoutedEventArgs e) => Hide();
    private void QuitClick(object sender, RoutedEventArgs e) => quit();

    private void GreetClick(object sender, RoutedEventArgs e)
    {
        if (inSession) return;
        finished = false;
        greeting = true;
        reaction.Restart();
        Say("greeting");
        RenderBreath();
    }

    private void VoiceClick(object sender, RoutedEventArgs e)
    {
        SavePreferences();
        if (!VoiceMenu.IsChecked) voice.Stop();
        else if (!inSession) GreetClick(sender, e);
        else
        {
            lastPhase = -1;
            if (!elapsed.IsRunning) Say("pause");
        }
        RenderBreath();
    }

    private void MotionClick(object sender, RoutedEventArgs e)
    {
        SavePreferences();
        RenderBreath();
    }

    private void Say(string cue)
    {
        if (VoiceMenu.IsChecked && IsVisible && !AllowClose) voice.Say(cue);
    }

    private void RestorePreferences()
    {
        try
        {
            if (!File.Exists(preferencesFile)) return;
            var saved = JsonSerializer.Deserialize<Preferences>(File.ReadAllText(preferencesFile));
            VoiceMenu.IsChecked = saved?.Voice == true;
            MotionMenu.IsChecked = saved?.ReducedMotion == true;
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException) { }
    }

    private void SavePreferences()
    {
        try
        {
            Directory.CreateDirectory(App.DataFolder);
            File.WriteAllText(preferencesFile, JsonSerializer.Serialize(new Preferences(VoiceMenu.IsChecked, MotionMenu.IsChecked)));
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException) { }
    }

    private void PebbleDown(object sender, MouseButtonEventArgs e)
    {
        press = e.GetPosition(this);
        Portrait.CaptureMouse();
    }

    private void PebbleMove(object sender, MouseEventArgs e)
    {
        if (press is not Point start || e.LeftButton != MouseButtonState.Pressed) return;
        var delta = e.GetPosition(this) - start;
        if (Math.Abs(delta.X) < SystemParameters.MinimumHorizontalDragDistance &&
            Math.Abs(delta.Y) < SystemParameters.MinimumVerticalDragDistance) return;
        press = null;
        Portrait.ReleaseMouseCapture();
        DragMove();
        EnsureOnScreen();
        SavePosition();
    }

    private void PebbleUp(object sender, MouseButtonEventArgs e)
    {
        bool clicked = press.HasValue;
        Portrait.ReleaseMouseCapture();
        press = null;
        if (clicked) Toggle();
    }

    private void PebbleLostCapture(object sender, MouseEventArgs e) => press = null;

    private void OnClosing(object? sender, CancelEventArgs e)
    {
        SavePosition();
        if (AllowClose)
        {
            StopSession(false);
            return;
        }
        e.Cancel = true;
        Hide();
    }

    private void RestorePosition()
    {
        Drawing.Point? saved = null;
        try
        {
            if (File.Exists(positionFile))
                saved = JsonSerializer.Deserialize<Drawing.Point>(File.ReadAllText(positionFile));
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException) { }
        Place(saved);
    }

    private void SavePosition()
    {
        if (!GetWindowRect(new WindowInteropHelper(this).Handle, out var rect)) return;
        try
        {
            Directory.CreateDirectory(App.DataFolder);
            File.WriteAllText(positionFile, JsonSerializer.Serialize(new Drawing.Point(rect.Left, rect.Top)));
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException) { }
    }

    internal void EnsureOnScreen()
    {
        if (GetWindowRect(new WindowInteropHelper(this).Handle, out var rect))
            Place(new Drawing.Point(rect.Left, rect.Top));
    }

    private void Place(Drawing.Point? saved)
    {
        var handle = new WindowInteropHelper(this).Handle;
        if (!GetWindowRect(handle, out var rect)) return;
        var screen = saved.HasValue ? Forms.Screen.FromPoint(saved.Value) : Forms.Screen.PrimaryScreen;
        if (screen == null) return;
        var area = screen.WorkingArea;
        int right = Math.Max(area.Left, area.Right - (rect.Right - rect.Left));
        int bottom = Math.Max(area.Top, area.Bottom - (rect.Bottom - rect.Top));
        int x = Math.Clamp(saved?.X ?? right - 20, area.Left, right);
        int y = Math.Clamp(saved?.Y ?? bottom - 18, area.Top, bottom);
        SetWindowPos(handle, IntPtr.Zero, x, y, 0, 0, 0x0001 | 0x0004 | 0x0010);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hwnd, out NativeRect rect);
    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int w, int h, uint flags);
}
