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
using System.Windows.Media.Imaging;
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
    private readonly DispatcherTimer tick = new() { Interval = TimeSpan.FromMilliseconds(100) };
    private readonly string positionFile = Path.Combine(App.DataFolder, "pebble-position.json");
    private Point? press;
    private bool inSession;
    private bool finished;
    private DateTimeOffset startedAt;
    internal bool AllowClose { get; set; }

    internal Companion(Action openStudio, Action quit, Action<PebbleSession> saveSession)
    {
        this.openStudio = openStudio;
        this.quit = quit;
        this.saveSession = saveSession;
        InitializeComponent();
        string image = Path.Combine(AppContext.BaseDirectory, "Web", "images", "pebble.png");
        if (File.Exists(image)) PebbleImage.Source = new BitmapImage(new Uri(image));
        SourceInitialized += (_, _) => RestorePosition();
        Closing += OnClosing;
        tick.Tick += (_, _) => RenderBreath();
        RenderBreath();
    }

    internal void StartSession()
    {
        if (inSession) StopSession(false);
        inSession = true;
        finished = false;
        startedAt = DateTimeOffset.UtcNow;
        elapsed.Restart();
        tick.Start();
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
            tick.Stop();
        }
        else
        {
            elapsed.Start();
            tick.Start();
        }
        RenderBreath();
    }

    private void StopSession(bool complete)
    {
        int seconds = Math.Min(Duration, (int)elapsed.Elapsed.TotalSeconds);
        if (inSession && seconds > 0)
            saveSession(new PebbleSession("rolig-vejrtraekning", startedAt.ToString("O"), DateTimeOffset.UtcNow.ToString("O"), seconds, complete || seconds == Duration));
        tick.Stop();
        elapsed.Reset();
        inSession = false;
        finished = complete;
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
        double scale = inSession && SystemParameters.ClientAreaAnimation ? .89 + .17 * (.5 - .5 * Math.Cos(fill * Math.PI)) : 1;
        BreathScale.ScaleX = BreathScale.ScaleY = scale;
        string label = !inSession ? (finished ? "Tak for pausen" : "Tag en rolig pause")
            : !elapsed.IsRunning ? "Fortsæt pausen"
            : $"{(inhale ? "Ånd ind" : "Ånd ud")} · {Math.Ceiling((inhale ? 4 : 8) - cycle)}";
        SessionButton.Content = label;
        SessionButton.ToolTip = !inSession ? "Start ét minut med Pebble"
            : elapsed.IsRunning ? "Sæt pausen på hold" : "Fortsæt vejrtrækningen";
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
    }

    private void ToggleClick(object sender, RoutedEventArgs e) => Toggle();
    private void OpenStudioClick(object sender, RoutedEventArgs e) => openStudio();
    private void EndClick(object sender, RoutedEventArgs e) => StopSession(false);
    private void HideClick(object sender, RoutedEventArgs e) => Hide();
    private void QuitClick(object sender, RoutedEventArgs e) => quit();

    private void PebbleDown(object sender, MouseButtonEventArgs e)
    {
        press = e.GetPosition(this);
        PebbleImage.CaptureMouse();
    }

    private void PebbleMove(object sender, MouseEventArgs e)
    {
        if (press is not Point start || e.LeftButton != MouseButtonState.Pressed) return;
        var delta = e.GetPosition(this) - start;
        if (Math.Abs(delta.X) < SystemParameters.MinimumHorizontalDragDistance &&
            Math.Abs(delta.Y) < SystemParameters.MinimumVerticalDragDistance) return;
        press = null;
        PebbleImage.ReleaseMouseCapture();
        DragMove();
        EnsureOnScreen();
        SavePosition();
    }

    private void PebbleUp(object sender, MouseButtonEventArgs e)
    {
        bool clicked = press.HasValue;
        PebbleImage.ReleaseMouseCapture();
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
