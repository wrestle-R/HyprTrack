import Link from "next/link";
import { CodeBlock } from "./code-block";
import { DOWNLOAD, INSTALL, REPO, VERSION } from "@/lib/site";

function Section({ number, title, id, children }: { number: string; title: string; id: string; children: React.ReactNode }) {
  return <section className="doc-section" id={id}><h2><span>{number}</span>{title}</h2>{children}</section>;
}

const database = "~/.local/bin/hyprtrack/collector/hyprtrack.db";
const collector = "~/.local/bin/hyprtrack/collector/hyprtrack-monitor.py";
const verify = `pgrep -af hyprtrack-monitor.py
hyprctl activewindow -j`;
const autostart = `exec-once = $HOME/.local/bin/hyprtrack/collector/hyprtrack-monitor.py`;
const lua = `hl.on("hyprland.start", function ()
    hl.exec_cmd("$HOME/.local/bin/hyprtrack/collector/hyprtrack-monitor.py")
end)`;
const backup = `database="$HOME/.local/bin/hyprtrack/collector/hyprtrack.db"
backup_dir="$HOME/.local/share/hyprtrack-backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir"
sqlite3 "$database" ".backup '$backup_dir/activity.db'"
cp -a "$HOME/.local/share/com.hyprtrack.desktop" \\
  "$backup_dir/desktop-preferences"
sqlite3 "$backup_dir/activity.db" "PRAGMA integrity_check;"
printf 'Backup: %s\\n' "$backup_dir"`;
const update = `( set -e
  VERSION=${VERSION}
  wget -O ~/.local/bin/hyprtrack-desktop.AppImage.new \\
    "https://github.com/wrestle-R/HyprTrack/releases/download/v\${VERSION}/HyprTrack.Desktop_\${VERSION}_amd64.AppImage"
  chmod +x ~/.local/bin/hyprtrack-desktop.AppImage.new
  mv ~/.local/bin/hyprtrack-desktop.AppImage.new \\
    ~/.local/bin/hyprtrack-desktop.AppImage
)
~/.local/bin/hyprtrack-desktop.AppImage`;

export const DOC_HEADINGS: Record<string,[string,string]> = {
  "getting-started":["A good place","to start."],
  collector:["A quiet listener.","A lasting record."],
  "themes-and-focus":["Your space.","Your pace."],
  mappings:["A name that","makes sense."],
  shortcuts:["Less clicking.","More doing."],
  updating:["A fresh start.","The same history."],
  privacy:["Your day.","Your data."],
  troubleshooting:["Back on","track."],
};

export function DocContent({slug}:{slug:string}) {
  switch(slug) {
    case "getting-started": return <>
      <Section number="01" title="Check your setup" id="requirements"><p>HyprTrack Desktop is supported on <strong>x86_64 Arch Linux with Hyprland</strong>. You need a working <code>hyprctl</code>, Python 3.10 or newer, GTK and WebKitGTK runtime libraries, and a StatusNotifier-compatible system tray.</p><p>The desktop app shows the dashboard. A separate Python collector records your active windows. Neither needs an account or a web server.</p></Section>
      <Section number="02" title="Download and launch" id="download"><p>Keep the AppImage at a permanent path so its launcher entry keeps working. These commands download the published v{VERSION} release.</p><CodeBlock code={INSTALL} label="Install / Arch Linux" /><p>On first launch, HyprTrack registers a desktop entry and exports the collector beside its local database. If you move the AppImage later, launch it from its new location once to refresh the launcher entry.</p><a className="button button-small" href={DOWNLOAD}>Download the AppImage ↗</a></Section>
      <Section number="03" title="Start recording" id="recording"><p>Run the exported collector from a terminal inside your Hyprland session:</p><CodeBlock code={collector} label="Start the collector" /><p>Leave it running while you use a few applications. Open Overview and refresh to see your first activity. Closing the desktop window hides it to the tray; the collector keeps working independently.</p><p>Next, add the collector to your Hyprland autostart so you don’t have to launch it each time. <Link href="/docs/collector">The collector chapter</Link> covers both standard and custom Lua configurations.</p></Section>
      <Section number="04" title="Make it feel like home" id="preferences"><p>Pick a palette and appearance in Settings, choose which application labels count as productive, and set a focus threshold. Explore Applications for rankings and Activity for grouped sessions.</p><p>Your settings live on your machine. A new theme or mapping changes how the dashboard reads your history; it leaves the original activity records intact.</p></Section>
    </>;
    case "collector": return <>
      <Section number="01" title="What it records" id="records"><p>The Python collector listens to Hyprland window events and stores application classes, window titles, and timed intervals in a local SQLite database. Active browser title changes are recorded immediately. Timestamps are stored in IST (<code>+05:30</code>).</p><p>This is a record of foreground windows. Focus quality is calculated from session duration and the thresholds you choose in the app.</p><CodeBlock code={`${collector}\n\n# Record a single sample\n${collector} --once\n\n# Use a different database\n${collector} --db /path/to/hyprtrack.db`} label="Collector commands" /><p>The desktop dashboard reads the default database path. A custom <code>--db</code> file is a separate recording target.</p></Section>
      <Section number="02" title="Start with Hyprland" id="autostart"><p>Launch the AppImage once before adding autostart so the exported script exists. If your configuration uses the standard <code>hyprland.conf</code> syntax, add:</p><CodeBlock code={autostart} label="hyprland.conf / standard config" /><p>The <a href="https://wiki.hypr.land/0.49.0/Configuring/Keywords/#executing">Hyprland exec-once keyword</a> runs a command when the compositor starts. Start the collector manually for the current session, or log out and back in to use the new autostart entry.</p><p>If you use the custom Lua setup that loads <code>~/.config/hypr/custom/execs.lua</code>, add the collector inside your existing <code>hyprland.start</code> block. A fresh block looks like:</p><CodeBlock code={lua} label="execs.lua / custom Lua config" /><p>Use the autostart style your configuration supports. Add the collector once; the lock beside the database prevents duplicate writers.</p></Section>
      <Section number="03" title="Check the listener" id="verify"><p>Run these checks inside the same Hyprland session. You should see a collector process and a JSON description of the active window.</p><CodeBlock code={verify} label="Verify recording" /><p>Collection continues when the dashboard is hidden or quit, as long as the collector process is running. The app is the viewer; the collector is the recorder.</p></Section>
    </>;
    case "themes-and-focus": return <>
      <Section number="01" title="Six palettes, every mood" id="palettes"><p>The desktop uses the same six palettes as MultiCodex: <strong>Sage, Ocean, Sand, Rose, Plum, and Orange</strong>. Each supports light, dark, and system appearance. Choose yours in Settings or the appearance control in the app header.</p><p>Appearance changes use a circular transition where supported, with a gentle fade on older WebKit versions. Reduced-motion preferences skip decorative animation.</p><p>You can also tune font size and sidebar width in Settings.</p></Section>
      <Section number="02" title="A small timer, a useful rhythm" id="pomodoro"><p>Open the timer in the desktop header. Pick a <strong>15, 25, 45, or 60 minute</strong> focus block and start a session. Pause and resume whenever you need to.</p><p>After a completed focus block, a 5-minute break is ready. Every fourth completed block offers a 15-minute long break. Breaks start when you choose to start them.</p><p>The timer remembers its deadline across page changes, hiding the window, and reopening the app. It keeps a daily completion count and can play an optional chime while the app is running. The collector is not required for the timer.</p></Section>
    </>;
    case "mappings": return <>
      <Section number="01" title="Turn titles into useful labels" id="labels"><p>Open Mappings in the desktop app. A rule pairs text to match in a window title with the label you want to see. For example, matching <code>github</code> can display <code>GitHub</code> instead of a long browser title.</p><p>Matching is case-insensitive. Your custom rules take priority over built-in mappings. Each match text must be unique, and both the match and display label must contain text.</p></Section>
      <Section number="02" title="Edit the view, keep the record" id="history"><p>Enable, disable, or edit rules to update the dashboard’s current and historical labels. The underlying SQLite records keep their original application classes and window titles.</p><p>Mappings are saved with your local desktop preferences. Keep a copy of those preferences along with a database backup when moving or updating your installation.</p></Section>
      <Section number="03" title="VS Code stays VS Code" id="vscode"><p>Editor aliases such as <code>com.microsoft.VSCode</code> appear as <strong>VS Code</strong> in current and historical analytics. Your custom title mappings still take priority.</p><p>Settings lets you choose productive labels. If a mapping changes a label you use for productivity, review that selection so your focus view still reflects your choices.</p></Section>
    </>;
    case "shortcuts": return <>
      <Section number="01" title="The defaults" id="defaults"><p>Shortcuts work while the HyprTrack desktop window is focused. Open Keybindings to edit, clear, or restore them.</p><div className="doc-table-wrap"><table className="doc-table"><thead><tr><th scope="col">Action</th><th scope="col">Shortcut</th></tr></thead><tbody>{[
        ["Overview","Ctrl + Alt + 1"],["Applications","Ctrl + Alt + 2"],["Activity","Ctrl + Alt + 3"],["Mappings","Ctrl + Alt + 4"],["Settings","Ctrl + Alt + 5"],["Keybindings","Ctrl + Alt + K"],["Refresh data","Ctrl + Alt + R"],["Toggle auto-refresh","Ctrl + Alt + A"],["Today / 7 days / 30 days","Ctrl + Alt + Shift + 1 / 2 / 3"],["Focus page search","Ctrl + Alt + F"],["Toggle appearance","Ctrl + Alt + T"],
      ].map(([action,key]) => <tr key={action}><td>{action}</td><td>{key}</td></tr>)}</tbody></table></div></Section>
      <Section number="02" title="Make them your own" id="customize"><p>Capture a shortcut in Keybindings and save your changes. The app checks for duplicates and unsupported combinations. Clearing a binding disables that action’s shortcut.</p><p>Super / Meta shortcuts are intentionally unsupported because Hyprland uses them for global bindings. Use Ctrl or Alt combinations for app-local actions.</p></Section>
    </>;
    case "updating": return <>
      <Section number="01" title="Back up the things you keep" id="backup"><p>Quit the desktop app using its tray menu before replacing it. The Python collector can keep recording. Save both your activity database and desktop preferences so you have a complete fallback.</p><p>The following commands use the SQLite CLI (<code>sqlite</code> on Arch). The SQLite backup handles a live collector safely. Run the preference copy after quitting the desktop app.</p><CodeBlock code={backup} label="Back up activity and preferences" /><p>The integrity result should be <code>ok</code>. The backup directory contains <code>activity.db</code> and <code>desktop-preferences</code>.</p></Section>
      <Section number="02" title="Replace the AppImage" id="replace"><p>Download a published release into a temporary file, then replace the AppImage at its original location. Change <code>VERSION</code> to the published version you want. These commands stop the replacement if the download fails.</p><CodeBlock code={update} label="Update from GitHub Releases" /><p>Launching the new version updates the exported collector script. Your existing database stays at <code>{database}</code>, and the desktop preferences retain their app identifier.</p></Section>
      <Section number="03" title="Verify your history" id="verify"><p>Reopen the app and check your older dates, mappings, and keybindings. You can also inspect the database:</p><CodeBlock code={`sqlite3 ${database} \\
  "PRAGMA integrity_check; SELECT COUNT(*) FROM activity_samples;"`} label="Check the database" /><p>The integrity check should report <code>ok</code>. Your row count should not decrease; it can increase while the collector keeps recording. Keep the backup until you are satisfied with the update.</p></Section>
    </>;
    case "privacy": return <>
      <Section number="01" title="On your machine" id="storage"><p>HyprTrack Desktop stores application classes, window titles, and session timestamps locally. It requires no account, web server, or network service to record and display your activity.</p><p>The collector database lives here:</p><CodeBlock code={database} label="Activity database" /><p>Desktop preferences, mappings, and keybindings live in the application data directory:</p><CodeBlock code="~/.local/share/com.hyprtrack.desktop" label="Desktop preferences" /><p>Raw titles remain in the database when you add a mapping. A mapping changes the displayed label rather than removing the source record.</p></Section>
      <Section number="02" title="Read the record yourself" id="inspect"><p>The data is ordinary SQLite. Use the CLI to inspect recent samples without opening the desktop app:</p><CodeBlock code={`sqlite3 ${database} \\
  "SELECT sampled_at, ended_at, app_class, window_title FROM activity_samples ORDER BY sampled_at DESC LIMIT 20;"`} label="Inspect recent activity" /><p>For a consistent copy while the collector is running, use SQLite’s backup operation. <Link href="/docs/updating">The update guide</Link> includes the commands.</p></Section>
      <Section number="03" title="About this website" id="website"><p>This website is a separate Next.js site hosted on Vercel. It does not connect to your desktop app or access your activity database. App screenshots and the interactive day dial use sample data.</p><p>The website saves only your appearance choice in this browser’s local storage. No analytics or third-party tracking scripts are included. Vercel handles normal web requests and hosting logs.</p><p>HyprTrack’s desktop app and this website are <a href={REPO}>open source</a> under the MIT license.</p></Section>
    </>;
    case "troubleshooting": return <>
      <Section number="01" title="No new activity?" id="recording"><p>Check that the exported collector exists and is running in your Hyprland session:</p><CodeBlock code={verify} label="Check the collector and Hyprland" /><p>If there is no collector process, launch it:</p><CodeBlock code={collector} label="Start recording" /><p>If <code>hyprctl</code> fails, use a terminal inside the active Hyprland session. Launch the AppImage once if the exported script is missing.</p></Section>
      <Section number="02" title="Duplicate collector warning" id="duplicate"><p>The collector uses a lock file beside the database to avoid duplicate writers. Find the older process with <code>pgrep -af hyprtrack-monitor.py</code> and stop that process before starting another against the same database.</p><p>Check your autostart configuration for repeated entries. Choose one startup entry for your normal collector.</p></Section>
      <Section number="03" title="No tray icon or launcher?" id="tray"><p>Enable a StatusNotifier-compatible tray in your desktop bar. Closing the HyprTrack window hides it to the tray; use the tray menu to quit it fully.</p><p>Keep the AppImage at its original location. If it moved, run it from the new path once to refresh the desktop launcher entry. Confirm the file is executable with <code>chmod +x</code>.</p></Section>
      <Section number="04" title="Something else feels wrong" id="report"><p>Check that your system meets the <Link href="/docs/getting-started">supported platform requirements</Link>. If you need help, open a <a href={`${REPO}/issues/new`}>GitHub issue</a> with your app version, relevant error text, and the steps to reproduce it.</p><p>A database can contain private window titles. Share a small example or error output rather than your whole activity database.</p></Section>
    </>;
    default: return null;
  }
}
