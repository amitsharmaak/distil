# Distil user guide

## Save from iPhone

1. Open **Settings → Capture → iPhone** and choose **Get the Shortcut** to install **Save to
   Distil**. The link appears once the shared Shortcut is published for the deployment.
2. Choose **Pair this iPhone**, run the Shortcut, and enter the displayed code. It works once and
   expires after ten minutes. You see **iPhone paired**; there is no token to copy or paste.
3. In your browser or another article app, choose **Share → Save to Distil**. Later shares save
   without asking for a code. **Saved to Distil** means the link was accepted for processing.

Use **Disconnect** beside the phone connection in the same Settings card to turn it off. The next
share reports **Distil disconnected this iPhone. Share again to pair.** Generate a new code and
share again to reconnect. Browser connections and the manual token for scripts remain active.

The Shortcut's saved credential uses iCloud Drive; devices on the same Apple Account can share
that pairing. See the [iPhone guide](iphone-shortcut.md) for installation, account switching,
recovery, the Home Screen app and the build-it-yourself recipe.

## Keyboard shortcuts

Distil can be driven from the keyboard on desktop. Press `?` (or ⌘/ on Mac, Ctrl+/ elsewhere) at
any time to open the in-app list, which shows the shortcuts that apply to the page you are on.

Notes that apply to every table below:

- **Pauses while you type.** Shortcuts do nothing while an input, textarea or select has focus,
  while a dialog is open, or when a modifier such as ⌘ or Ctrl is held. Press Esc to leave a field
  first. `g` shortcuts are two-key sequences: press `g`, then the second key.
- **Single-key switch.** Settings → Account → Keyboard shortcuts turns the single-key shortcuts
  off if they collide with an assistive tool or a habit. The switch is stored per browser.
  The help shortcuts (`?`, ⌘/ or Ctrl+/) stay available.
- **Browser shortcuts are untouched.** ⌘R, ⌥←, ⌘L, Tab and the rest of the browser's own keys work
  exactly as before; Distil only listens for the keys below.

### General

| Keys         | Action                          |
| ------------ | ------------------------------- |
| `?`          | Open keyboard shortcuts         |
| ⌘/ or Ctrl+/ | Open keyboard shortcuts         |
| `/`          | Focus search                    |
| `[`          | Collapse or expand the sidebar  |
| Shift+T      | Toggle light and dark theme     |
| Esc          | Close a dialog or leave a field |

### Navigation

| Keys  | Action         |
| ----- | -------------- |
| `g t` | Go to Today    |
| `g f` | Go to Feed     |
| `g r` | Go to Research |
| `g s` | Go to Settings |

### Lists (Feed and Today)

| Keys        | Action                                | Where       |
| ----------- | ------------------------------------- | ----------- |
| `j`         | Move to the next item                 | Feed, Today |
| `k`         | Move to the previous item             | Feed, Today |
| `o` / Enter | Open the focused item                 | Feed, Today |
| `r`         | Mark the focused item read            | Feed        |
| `a`         | Change the focused item's area        | Feed        |
| `f`         | Open the filters                      | Feed        |
| `u`         | Toggle the unread filter              | Feed        |
| `c`         | Toggle compact and comfortable layout | Feed        |

### Reading

| Keys      | Action                                        |
| --------- | --------------------------------------------- |
| ← or `k`  | Previous item                                 |
| → or `j`  | Next item                                     |
| `r`       | Mark as read and go to the next item          |
| Shift+U   | Mark as unread                                |
| `u` / Esc | Back to the list                              |
| `o`       | Open the original in a new tab                |
| `+`       | Like                                          |
| `-`       | Dislike                                       |
| `a`       | Change the item's area                        |
| Shift+D   | Start deep research on the item               |
| Shift+C   | Copy the link                                 |
| `s`       | Show or hide the AI summary                   |
| `d`       | Switch the summary between short and detailed |
| Shift+S   | Regenerate the summary                        |

### Research

| Keys    | Action                     | Where             |
| ------- | -------------------------- | ----------------- |
| `n`     | Start a new research topic | Research          |
| Shift+S | Scan for new research      | Research          |
| `u`     | Back to Research           | A research report |
| Shift+C | Copy the report            | A research report |
| Shift+D | Research further           | A research report |

### Settings

| Keys | Action               |
| ---- | -------------------- |
| `1`  | Open the Capture tab |
| `2`  | Open the Account tab |
