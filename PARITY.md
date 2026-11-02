# Feature parity with the stock WLED UI

Where this UI knowingly differs from the stock one (`wled-firmware/wled00/data`). Remove an entry once it's
closed.

## Settings

### Only available through the settings script

The stock settings pages get their values by loading `/settings/s.js?p=<page>`, JavaScript that the firmware
generates to fill in their forms (`getSettingsJS()` in `wled00/xml.cpp`). This UI reads settings through the
JSON API instead (`/json/cfg`, `/json/info`) and doesn't use that script. Two things are only exposed there:

| Stock feature | Where the stock UI gets it | What this UI does |
| --- | --- | --- |
| Wi-Fi → ESP-NOW: "Last device seen" and its **+** button, which links that device as a remote | `last_signal_src`, written to `s.js?p=1` only (`xml.cpp`) | Not shown. Remotes are linked with an **Add remote** button and the MAC typed in (12 hex characters). |
| Settings menu: the **2D configuration** entry is hidden on builds without 2D (`WLED_DISABLE_2D`) | `s.js?p=0` hides the button | Always listed. On a build without 2D, the link doesn't lead to a 2D page. |

Both would need the firmware to expose these values in its JSON API.

### Small differences

- Wi-Fi → client IP has no "(Ethernet)" suffix when the light is on Ethernet. `/json/info` has the IP
  (`info.ip`) but not whether it's wired.
- Wi-Fi → AP IP comes from `info.wifi.ap` (whether the AP is running) and the firmware's fixed AP address,
  4.3.2.1. The stock page shows the IP whenever the AP interface has one, which can include times the AP is
  off.
- Wi-Fi → on builds with WPA-Enterprise, the encryption type can be set for new networks too. The stock page
  only shows it for networks loaded from the device.
- Leaving a settings page with the browser's own back button doesn't warn about unsaved changes. In-app links,
  reloading and closing the tab do.

### Pages not rebuilt yet

These link to the firmware's own pages: LED and hardware, Pin info, 2D configuration, DMX output, Sync
interfaces, Time and macros, Usermods, Security and updates.

## Main UI

- The stock UI's appearance options are kept in the browser (Settings → User interface → "Stock UI only")
  but not applied here: light theme, background image or colour, button and background opacity, button
  labels, PC-mode tab bar, colour selection methods, custom CSS (`skin.css`) and holidays.
- Simplified UI (stored on the device) isn't applied here.
- The stock UI's prompt to report a version upgrade isn't implemented.
