using System;
using System.IO;
using System.Text.Json;
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
                if (!e.Cancel) ready = false;
            };
            core.NewWindowRequested += (_, e) => e.Handled = true;
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
                    case "pebble-ready":
                        ready = true;
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

    private static bool IsLocalPage(string url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var page) && page.Scheme == "https" && page.Host == AppHost && page.IsDefaultPort;

    private void SendSession(PebbleSession session)
    {
        if (ready && !closed)
            browser.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "pebble-session", record = session }, PebbleHistory.Json));
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
