using System;
using System.Drawing;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows;
using Forms = System.Windows.Forms;

namespace Aandehul;

public partial class App : Application
{
    internal static string DataFolder { get; } =
        Environment.GetEnvironmentVariable("AANDEHUL_DATA_DIR") is string folder && Path.IsPathFullyQualified(folder)
        ? folder
        : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Aandehul");
    private Mutex? instance;
    private EventWaitHandle? wake;
    private RegisteredWaitHandle? wakeRegistration;
    private Companion? companion;
    private Studio? studio;
    private Forms.NotifyIcon? tray;
    private Icon? trayIcon;
    private PebbleHistory? history;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        // The default profile keeps the same instance handles across app updates.
        // A separate portable profile has its own history and foreground window.
        string suffix = Environment.GetEnvironmentVariable("AANDEHUL_DATA_DIR") is string custom && Path.IsPathFullyQualified(custom)
            ? "." + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Path.GetFullPath(custom).ToUpperInvariant())))[..20]
            : "";
        wake = new EventWaitHandle(false, EventResetMode.AutoReset, @"Local\Aandehul.Show.v1" + suffix);
        instance = new Mutex(true, @"Local\Aandehul.Instance.v1" + suffix, out bool first);
        if (!first)
        {
            wake.Set();
            Shutdown();
            return;
        }

        history = new PebbleHistory();
        companion = new Companion(OpenStudio, Quit, history.Add);
        var menu = new Forms.ContextMenuStrip();
        menu.Items.Add("Åbn Åndehul", null, (_, _) => OpenStudio());
        var toggle = menu.Items.Add("Skjul Pebble", null, (_, _) =>
        {
            if (companion.IsVisible) companion.Hide();
            else ShowCompanion();
        });
        menu.Items.Add("Træk vejret i ét minut", null, (_, _) => StartBreathing());
        menu.Items.Add(new Forms.ToolStripSeparator());
        menu.Items.Add("Afslut Åndehul", null, (_, _) => Quit());
        menu.Opening += (_, _) => toggle.Text = companion.IsVisible ? "Skjul Pebble" : "Vis Pebble";
        trayIcon = Environment.ProcessPath is string exe ? Icon.ExtractAssociatedIcon(exe) : null;
        tray = new Forms.NotifyIcon
        {
            Icon = trayIcon ?? SystemIcons.Application,
            Text = "Åndehul · Pebble",
            ContextMenuStrip = menu,
            Visible = true
        };
        tray.DoubleClick += (_, _) => OpenStudio();
        wakeRegistration = ThreadPool.RegisterWaitForSingleObject(wake, (_, _) =>
            Dispatcher.InvokeAsync(OpenStudio), null, Timeout.Infinite, false);
        companion.Show();
    }

    private void ShowCompanion()
    {
        companion!.Show();
        companion.EnsureOnScreen();
        companion.Activate();
    }

    private void StartBreathing()
    {
        ShowCompanion();
        companion!.StartSession();
    }

    private void OpenStudio()
    {
        if (studio == null)
        {
            studio = new Studio(ShowCompanion, StartBreathing, history!);
            studio.Closed += (_, _) => studio = null;
        }
        if (studio.WindowState == WindowState.Minimized)
            studio.WindowState = WindowState.Normal;
        studio.Show();
        studio.Activate();
    }

    private void Quit()
    {
        if (companion != null) companion.AllowClose = true;
        Shutdown();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        wakeRegistration?.Unregister(null);
        wake?.Dispose();
        instance?.Dispose();
        if (tray != null)
        {
            tray.Visible = false;
            tray.ContextMenuStrip?.Dispose();
            tray.Dispose();
        }
        trayIcon?.Dispose();
        base.OnExit(e);
    }
}
