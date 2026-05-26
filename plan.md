# Terminal Page Modularization Plan

## Summary

Extract the Terminal page logic from `main.js` into a reusable `terminal_page.js` module. The first step keeps the current HTML and CSS in place and only moves JavaScript state and behavior. Later steps can make the module render its own DOM and ship with dedicated styles if other projects need a drop-in component.

## Step 1: Extract Terminal Behavior

Add `terminal_page.js` with:

```js
window.TermPWA.createTerminalPage = function ({
    rootSelector = "#view-terminal",
    serialSession,
    serialBus,
    debugLog = () => {},
}) {
    // ...
};
```

Move Terminal-only state and behavior from `main.js` into this module:

- command history
- RX idle buffering
- terminal themes
- copy and clear output
- interval send
- direct keyboard-to-UART send
- HEX mode conversion
- UART timestamp and auto-scroll

The module should manage the existing Terminal DOM IDs in `index.html`, including `terminalOutput`, `atCommandInput`, `sendCmdBtn`, `hexSendToggle`, `rxIdleInput`, `appendNewlineToggle`, `sendIntervalInput`, `intervalSendBtn`, and Quick Send root.

## Step 2: Public Interface

`createTerminalPage()` should return:

```js
{
    handleConnected(),
    handleDisconnected(),
    handleSessionChanged(),
    writeSystem(text),
    writeError(text),
    writeTxEcho(text, options),
    clear(),
    stopIntervalSend()
}
```

`main.js` should only create the module and call these lifecycle methods from `updateUI()` and `updateSessionUI()`. Other pages should write to Terminal through `terminalPage.writeSystem()` or `terminalPage.writeTxEcho()` instead of calling local `main.js` helpers.

## Step 3: Quick Send Ownership

Quick Send should become a Terminal child module:

```js
quickSendPanel = createQuickSendPanel({
    serialSession,
    appendNewlineToggle,
    writeTerminal: terminalPage.writeSystem,
    writeTerminalTxEcho: terminalPage.writeTxEcho,
    debugLog,
});
```

`main.js` should no longer hold `quickSendPanel` directly. Terminal should proxy connected, disconnected, and sessionChanged events to Quick Send.

## Step 4: Keep HTML/CSS Stable First

Do not move Terminal HTML or CSS in the first refactor. Only add:

```html
<script src="./terminal_page.js"></script>
```

Also add `terminal_page.js` to:

- `service_worker.js` app asset cache
- `Dockerfile` copied runtime files

## Step 5: Optional Future Componentization

If other projects need a drop-in Terminal component, add a second stage:

- optional `render: true` mode to generate Terminal HTML
- dedicated `terminal.css`
- configurable `storagePrefix`
- configurable default Quick Send groups
- optional feature flags for Quick Send, HEX mode, timestamp, and interval send

## Test Plan

- `node --check main.js terminal_page.js quick_send.js`
- `git diff --check`
- Verify serial connect/disconnect updates Terminal state.
- Verify RX text and HEX display, RX idle, UART timestamp, auto-scroll, copy, clear, themes.
- Verify AT send, command history, direct keyboard send, and interval send.
- Verify Quick Send send/import/export/drag/hide/resize.
- Verify NetView, Firmware Update, and Configuration can still write status text to Terminal.
- Verify PWA offline cache and Docker image include `terminal_page.js`.

## Assumptions

- `serialSession` and `serialBus` remain external dependencies injected into Terminal.
- Quick Send is part of Terminal and follows the Terminal lifecycle.
- The first refactor focuses on reusable behavior, not a fully standalone visual component.
