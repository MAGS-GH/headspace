using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace Aandehul;

internal sealed class Studio : Window
{
    private const string AppHost = "aandehul.local";
    private readonly WebView2 browser = new();
    private readonly Action showCompanion;
    private readonly Action startBreathing;
    private readonly PebbleHistory history;
    private bool ready;
    private bool closed;
    private bool companionSpeaking;
    private int ambientRevision;
    internal bool AmbientPlaying { get; private set; }
    internal bool AllowClose { get; set; }

    internal Studio(Action showCompanion, Action startBreathing, PebbleHistory history)
    {
        this.showCompanion = showCompanion;
        this.startBreathing = startBreathing;
        this.history = history;
        history.Added += SendSession;
        Title = "Åndehul";
        Width = Math.Min(1180, SystemParameters.WorkArea.Width);
        Height = Math.Min(800, SystemParameters.WorkArea.Height);
        MinWidth = 340;
        MinHeight = 450;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        Background = new SolidColorBrush(Color.FromRgb(249, 248, 241));
        browser.DefaultBackgroundColor = System.Drawing.Color.FromArgb(249, 248, 241);
        Content = browser;
        Loaded += LoadStudio;
        Closing += (_, e) =>
        {
            if (!AmbientPlaying || AllowClose || !TrySend(new { type = "studio-hidden" })) return;
            e.Cancel = true;
            Hide();
        };
        Closed += (_, _) =>
        {
            closed = true;
            history.Added -= SendSession;
            browser.Dispose();
        };
    }

    private async void LoadStudio(object sender, RoutedEventArgs args)
    {
        Loaded -= LoadStudio;
        string site = Path.Combine(AppContext.BaseDirectory, "Web");
        if (!File.Exists(Path.Combine(site, "index.html")))
        {
            ShowMessage("Øvelsesrummet mangler", "Pak hele Åndehul-mappen ud, så Web-mappen ligger ved siden af programmet.");
            return;
        }
        try
        {
            var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(App.DataFolder, "WebView"));
            if (closed) return;
            await browser.EnsureCoreWebView2Async(environment);
            if (closed) return;
            var core = browser.CoreWebView2;
            core.SetVirtualHostNameToFolderMapping(AppHost, site, CoreWebView2HostResourceAccessKind.DenyCors);
            core.Settings.AreHostObjectsAllowed = false;
            core.NavigationStarting += (_, e) =>
            {
                e.Cancel = !IsLocalPage(e.Uri);
                if (!e.Cancel)
                {
                    ready = false;
                    SetAmbientPlaying(false);
                }
            };
            core.ProcessFailed += (_, e) =>
            {
                if (e.ProcessFailedKind is CoreWebView2ProcessFailedKind.BrowserProcessExited or CoreWebView2ProcessFailedKind.RenderProcessExited)
                {
                    ready = false;
                    SetAmbientPlaying(false);
                }
            };
            core.NewWindowRequested += OpenMusicSource;
            core.WebMessageReceived += (_, e) =>
            {
                if (!IsLocalPage(e.Source)) return;
                using var json = JsonDocument.Parse(e.WebMessageAsJson);
                if (json.RootElement.ValueKind != JsonValueKind.String) return;
                string? message = json.RootElement.GetString();
                switch (message)
                {
                    case "show-pebble": showCompanion(); break;
                    case "start-breathing": startBreathing(); break;
                    case "ambient-playing": SetAmbientPlaying(true); break;
                    case "ambient-stopped": SetAmbientPlaying(false); break;
                    case "pebble-ready":
                        ready = true;
                        SetCompanionSpeaking(companionSpeaking);
                        foreach (var session in history.Pending) SendSession(session);
                        break;
                    case string ack when ack.StartsWith("pebble-saved:", StringComparison.Ordinal):
                        history.Acknowledge(ack["pebble-saved:".Length..]);
                        break;
                }
            };
            core.Navigate($"https://{AppHost}/index.html");
        }
        catch (Exception e) when (e is WebView2RuntimeNotFoundException or System.Runtime.InteropServices.COMException or InvalidOperationException or IOException or UnauthorizedAccessException)
        {
            if (!closed)
                ShowMessage("Øvelsesrummet kunne ikke åbnes", "Kontrollér, at Microsoft Edge WebView2 Runtime er installeret, og at Windows kan gemme lokale appdata. Pebbles vejrtrækningspause er stadig tilgængelig ved uret.");
        }
    }

    private static bool IsLocalPage(string? url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var page) && page.Scheme == "https" && page.Host == AppHost && page.IsDefaultPort;

    private void OpenMusicSource(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        e.Handled = true;
        if (!e.IsUserInitiated || !IsLocalPage(e.OriginalSourceFrameInfo?.Source) || !IsMusicSource(e.Uri)) return;
        try
        {
            Process.Start(new ProcessStartInfo(e.Uri) { UseShellExecute = true })?.Dispose();
        }
        catch (Win32Exception)
        {
            MessageBox.Show(this, "Windows kunne ikke åbne linket. Vælg en standardbrowser i Windows-indstillinger.", "Åbn musikkilde", MessageBoxButton.OK, MessageBoxImage.Information);
        }
    }

    private static bool IsMusicSource(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var source) || source.Scheme != "https" ||
            !source.IsDefaultPort || source.UserInfo.Length != 0) return false;
        string path = source.AbsolutePath;
        return source.Host switch
        {
            "c418.bandcamp.com" => source.PathAndQuery == "/track/sweden",
            "github.com" => path == "/VoxeLibre/VoxeLibre" || path.StartsWith("/VoxeLibre/VoxeLibre/", StringComparison.Ordinal),
            "creativecommons.org" => path.StartsWith("/licenses/", StringComparison.Ordinal) || path.StartsWith("/publicdomain/", StringComparison.Ordinal),
            "opengameart.org" => path.StartsWith("/content/", StringComparison.Ordinal) || path.StartsWith("/users/", StringComparison.Ordinal),
            "incompetech.com" => path == "/music/royalty-free/index.html" && source.Query == "?isrc=USUAN1100787",
            _ => false
        };
    }

    internal void SetCompanionSpeaking(bool active)
    {
        companionSpeaking = active;
        TrySend(new { type = "companion-speaking", active });
    }

    private void SetAmbientPlaying(bool playing)
    {
        AmbientPlaying = playing;
        ambientRevision++;
        if (!playing && !IsVisible)
            Dispatcher.InvokeAsync(() => { if (!closed && !IsVisible && !AmbientPlaying) Close(); });
    }

    internal async void StopAmbient()
    {
        if (!AmbientPlaying || closed) return;
        int revision = ambientRevision;
        if (TrySend(new { type = "stop-ambient" }))
        {
            await Task.Delay(1500);
            if (closed || !AmbientPlaying || revision != ambientRevision) return;
        }
        // A renderer that cannot acknowledge Stop must not keep an invisible audio session alive.
        AmbientPlaying = false;
        Close();
    }

    private void SendSession(PebbleSession session) => TrySend(new { type = "pebble-session", record = session });

    private bool TrySend(object message)
    {
        if (!ready || closed) return false;
        try
        {
            browser.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(message, PebbleHistory.Json));
            return true;
        }
        catch (Exception e) when (e is COMException or InvalidOperationException)
        {
            return false;
        }
    }

    private void ShowMessage(string heading, string message)
    {
        var panel = new StackPanel
        {
            Margin = new Thickness(32), MaxWidth = 520,
            VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Center
        };
        panel.Children.Add(new TextBlock { Text = heading, FontSize = 26, FontWeight = FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap });
        panel.Children.Add(new TextBlock { Text = message, FontSize = 16, Margin = new Thickness(0, 12, 0, 0), TextWrapping = TextWrapping.Wrap });
        Content = panel;
    }
}
