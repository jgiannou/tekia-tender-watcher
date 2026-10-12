# ARC Pulse (macOS desktop pulse)

Native macOS companion for ARC Tenders Prod pulse (Users / Orgs / Paying / Errors + health).

Primary UI: macOS **WidgetKit** desktop widget.  
App Group: `group.37ZNXDS49B.arc.tenders.pulse` + shared Keychain (Personal Team).

## Build / install

```bash
cd apps/ops-pulse-widget
./scripts/build-install.sh
```

## Use

1. Open **ARC Pulse** → paste API URL + `ADMIN_TOKEN` → **Save** → **Test**
2. Desktop → **Edit Widgets** → add **ARC Pulse**
3. Tap **↻** on the widget for a manual refresh