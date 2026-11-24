using System;
using System.Collections.Generic;
using System.IO;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace Aandehul;

internal enum PebbleMood { Rest, Greeting, Inhale, Exhale, Pause, Finished }

public partial class PebblePortrait : UserControl
{
    internal const double GlancePeriod = 17;
    internal const double GlanceDuration = 1.7;
    private readonly Dictionary<string, ImageSource> layers = new();

    public PebblePortrait()
    {
        InitializeComponent();
        var images = Path.Combine(AppContext.BaseDirectory, "Web", "images");
        foreach (string name in new[] { "body", "sprout", "eyes-rest", "eyes-open", "eyes-happy", "mouth-smile", "mouth-round", "mouth-talk" })
        {
            var path = Path.Combine(images, "pebble-parts", name + ".png");
            if (File.Exists(path))
            {
                var image = new BitmapImage(new Uri(path));
                image.Freeze();
                layers[name] = image;
            }
        }
        Body.Source = layers.GetValueOrDefault("body");
        Sprout.Source = layers.GetValueOrDefault("sprout");
        if (Body.Source == null && File.Exists(Path.Combine(images, "pebble.png")))
            Body.Source = new BitmapImage(new Uri(Path.Combine(images, "pebble.png")));
    }

    internal void Pose(PebbleMood mood, double fill, double sinceReaction, double seconds, bool animate, bool speaking, double mouthOpening)
    {
        bool breathing = mood is PebbleMood.Inhale or PebbleMood.Exhale;
        // A raised breath is taller, with a lighter, narrower shadow. The feet stay anchored.
        double expansion = animate && breathing ? (1 - Math.Cos(Math.PI * fill)) / 2 : 0;
        double width = animate && breathing ? .89 + .25 * expansion : 1;
        double height = animate && breathing ? .88 + .25 * expansion : 1;
        double rise = -4.5 * expansion;
        double lean = animate && breathing ? (expansion - .5) * 2.8 : 0;
        double leaf = animate && breathing ? -9 * Math.Sin(seconds * Math.PI / 4 - .4) : 0;
        double glance = sinceReaction % GlancePeriod;
        bool looking = animate && mood == PebbleMood.Rest && glance < GlanceDuration;
        if (looking)
        {
            double turn = Math.Pow(Math.Sin(Math.PI * glance / GlanceDuration), 2);
            lean += 2.5 * turn;
            leaf += 7 * turn;
        }
        if (animate && sinceReaction < 2)
        {
            double settle = Math.Exp(-2.7 * sinceReaction);
            double beat = Math.Sin(sinceReaction * 8) * settle;
            if (mood == PebbleMood.Greeting)
            {
                lean += 11 * beat;
                leaf -= 18 * beat;
                rise -= 5 * Math.Abs(beat);
            }
            else if (mood is PebbleMood.Finished or PebbleMood.Pause)
            {
                height -= .12 * beat;
                width += .09 * beat;
                lean -= 4 * beat;
                leaf += 13 * beat;
            }
        }
        BodySize.ScaleX = width;
        BodySize.ScaleY = height;
        BodyLean.Angle = lean;
        BodyLift.Y = rise;
        LeafTurn.Angle = leaf;
        ShadowSize.ScaleX = 1 - .27 * expansion + rise * .008;
        GroundShadow.Opacity = .68 - .29 * expansion;

        bool blink = animate && mood == PebbleMood.Greeting && sinceReaction is > 1.45 and < 1.64;
        Eyes.Source = layers.GetValueOrDefault(mood switch
        {
            PebbleMood.Greeting when !blink => "eyes-open",
            PebbleMood.Rest when looking && glance is > .33 and < 1.28 => "eyes-open",
            PebbleMood.Finished => "eyes-happy",
            _ => "eyes-rest"
        });
        bool talking = animate && speaking;
        bool open = talking && mouthOpening > .08;
        Mouth.Source = layers.GetValueOrDefault(open ? "mouth-talk" : mood == PebbleMood.Exhale && !talking ? "mouth-round" : "mouth-smile");
        MouthSize.ScaleY = open ? .53 + .66 * mouthOpening : 1;
        MouthSize.ScaleX = open ? .96 + .13 * mouthOpening : 1;
    }
}
