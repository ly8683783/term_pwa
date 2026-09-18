# app_demo Quick Start

This guide is for customers who want to do three things as quickly as possible:

- set the required parameters
- modify the right `app_demo` code points
- run the firmware and confirm that it works

For full API and framework details, refer to `W88M_API_Reference_Guide`. This file keeps only the shortest bring-up path.

## What app_demo Does

`app_demo` is an optional, runnable reference application built on top of the base Wi-Fi SDK. It turns the saved Wi-Fi and network settings into a working application path:

```text
Saved configuration -> Wi-Fi connection -> IP ready -> enabled network links -> product business callbacks
```

When `app_demo` is enabled at boot, it:

- loads the persisted Wi-Fi, IP, MQTT, TCP, and UDP settings;
- connects to the configured Wi-Fi network and monitors Wi-Fi/IP changes;
- starts the links selected by `AMP_VARID_LINK_TYPE` (`var53`): MQTT, or TCP Client, UDP Peer, and TCP Server;
- retries supported connections after a disconnect using backoff;
- sends received data to the business handler, and provides periodic telemetry and heartbeat hooks;
- when `APP_DEMO_CLI_ENABLE=1`, registers `at+ab test` for the interactive demo commands.

`app_demo` is not required for the base Wi-Fi stack or standard AT commands. It is also not a finished product application: replace the default business handlers in `app_business.c` with your product-specific command parsing, replies, telemetry, and heartbeat behavior.

## 1. Fastest Path

For a first bring-up, start with `STA + MQTT`.

Why this path:

- it exercises Wi-Fi join
- it exercises IPv4 readiness
- it exercises one full application link
- it lets you verify both downlink and uplink in `app_business.c`

Recommended first sequence:

1. Set `AMP_VARID_APP_AUTO_START` (`var64`) to `true`.
2. Set Wi-Fi STA parameters.
3. Set MQTT broker parameters.
4. Set `AMP_VARID_LINK_TYPE` (`var53`) to `1` to enable MQTT only.
5. Follow Section 4 to add one test command handler.
6. Build, flash, reset or power on, and watch the log.

## 2. Required Parameters

For `app_demo` STA auto-connect, use:

- `AMP_VARID_AUTO_SSID` (`var65`) for the SSID
- `AMP_VARID_PASS_PHRASE_ALT` (`var66`) for the passphrase

For AP mode, use `AMP_VARID_SSID` (`var08`) and `AMP_VARID_PASS_PHRASE` (`var09`).

`AMP_VARID_APP_AUTO_START` (`var64`) is the boot-time gate for `app_demo`. Its default is `false`. Set it to `true` before reset or power-on to start the AppDemo task and, when `APP_DEMO_CLI_ENABLE=1`, register `at+ab test`. When it is `false`, the base Wi-Fi and standard AT functions still start, but the demo command and all AppDemo business tasks remain stopped. Changing this value takes effect on the next reset or power-on.

### 2.1 STA + MQTT

| Parameter | Var ID | Value / Purpose | Required |
| :--- | :--- | :--- | :--- |
| `AMP_VARID_DHCP_MODE` | `var04` | `true` | Yes |
| `AMP_VARID_DEVICE_MODE` | `var28` | `STA` | Yes |
| `AMP_VARID_KEEP_ALIVE` | `var36` | MQTT keep-alive interval | Optional |
| `AMP_VARID_MQTT_SERVER_IP` | `var42` | MQTT broker hostname or IPv4 address | Yes |
| `AMP_VARID_MQTT_SERVER_PORT` | `var43` | MQTT broker port | Yes |
| `AMP_VARID_MQTT_SERVER_USR_NAME` | `var44` | Broker user name | Optional |
| `AMP_VARID_MQTT_SERVER_PASSWD` | `var45` | Broker password | Optional |
| `AMP_VARID_MQTT_SUBSCRIBE_TOPIC` | `var46` | Downlink topic | Yes |
| `AMP_VARID_MQTT_PUBLISH_TOPIC` | `var47` | Uplink topic | Yes |
| `AMP_VARID_MQTT_QOS` | `var48` | MQTT quality of service | Optional |
| `AMP_VARID_MQTT_AUTH_TYPE` | `var49` | MQTT authentication mode | Optional |
| `AMP_VARID_LINK_TYPE` | `var53` | `1` for MQTT only | Yes |
| `AMP_VARID_APP_AUTO_START` | `var64` | `true` to start demo on boot | Yes |
| `AMP_VARID_AUTO_SSID` | `var65` | Wi-Fi network name | Yes |
| `AMP_VARID_PASS_PHRASE_ALT` | `var66` | Wi-Fi passphrase | Yes |

AT example:

```text
at+ab config var04=true
at+ab config var28=STA
at+ab config var42=192.168.1.76
at+ab config var43=1883
at+ab config var46=SToC
at+ab config var47=CToS
at+ab config var53=1
at+ab config var64=true
at+ab config var65=OfficeWiFi
at+ab config var66=12345678
```

Code example:

```c
wlan_config_info(AMP_VARID_DEVICE_MODE, "STA");
wlan_config_info(AMP_VARID_AUTO_SSID, "OfficeWiFi");
wlan_config_info(AMP_VARID_PASS_PHRASE_ALT, "12345678");
wlan_config_info(AMP_VARID_DHCP_MODE, "true");
wlan_config_info(AMP_VARID_LINK_TYPE, "1");
wlan_config_info(AMP_VARID_APP_AUTO_START, "true");
wlan_config_info(AMP_VARID_MQTT_SERVER_IP, "192.168.1.76");
wlan_config_info(AMP_VARID_MQTT_SERVER_PORT, "1883");
wlan_config_info(AMP_VARID_MQTT_SUBSCRIBE_TOPIC, "SToC");
wlan_config_info(AMP_VARID_MQTT_PUBLISH_TOPIC, "CToS");
```

> **Restart required:** Configuration changes made through either `at+ab config` or `wlan_config_info()` are stored for use at the next boot. Restart the module after completing the configuration before verifying the connection.

### 2.2 STA + IPv6 TCP/UDP/MQTT

Use this path when `app_demo` should wait for IPv6 readiness before starting TCP, UDP, or MQTT communication.

| Parameter | Var ID | Value / Purpose |
| :--- | :--- | :--- |
| `AMP_VARID_HOST_PORT` | `var13` | TCP Client and UDP Peer destination port |
| `AMP_VARID_LOCAL_PORT` | `var14` | UDP local port and TCP Server listening port |
| `AMP_VARID_DEVICE_MODE` | `var28` | `STA` |
| `AMP_VARID_MQTT_SERVER_IP` | `var42` | MQTT broker IPv6 address |
| `AMP_VARID_MQTT_SERVER_PORT` | `var43` | MQTT broker port |
| `AMP_VARID_REMOTE_IPV6_ADDRS` | `var51` | TCP Client and UDP Peer destination address |
| `AMP_VARID_ADDR_TYPE` | `var52` | `1` for IPv6 |
| `AMP_VARID_LINK_TYPE` | `var53` | `0`: TCP Client, UDP Peer, and TCP Server; `1`: MQTT only; `2`: all listed links |
| `AMP_VARID_AUTO_SSID` | `var65` | Wi-Fi network name |
| `AMP_VARID_PASS_PHRASE_ALT` | `var66` | Wi-Fi passphrase |

Example: IPv6 MQTT only

```text
at+ab config var28=STA
at+ab config var42=240e:328:3f4:d502::1
at+ab config var43=1883
at+ab config var52=1
at+ab config var53=1
at+ab config var65=OfficeWiFi
at+ab config var66=12345678
```

Example: IPv6 TCP/UDP and MQTT

```text
at+ab config var13=2015
at+ab config var14=2016
at+ab config var42=240e:328:3f4:d502::1
at+ab config var43=1883
at+ab config var51=240e:328:3f4:d502::2
at+ab config var52=1
at+ab config var53=2
```

`AMP_VARID_MQTT_SERVER_IP` (`var42`) accepts either a hostname or an IP literal. For an IPv6 MQTT broker, use a plain IPv6 literal without square brackets. The current hostname lookup supports IPv4 results, but does not yet reliably select an IPv6 result for MQTT.

After Wi-Fi joins, `app_demo` waits for a usable global IPv6 address. IPv4 readiness alone does not start any enabled TCP, UDP, or MQTT link. When a valid IPv6 address becomes available, `app_demo` starts all links selected by `AMP_VARID_LINK_TYPE` (`var53`).

`AMP_VARID_LOCAL_IPV6_ADDRS` (`var50`) is not used by `app_demo`. The module obtains its local IPv6 address from the network, such as through SLAAC.

> **Restart required:** Configuration changes made through either `at+ab config` or `wlan_config_info()` take effect after the next restart.

### 2.3 AP + UDP or TCP Server

Use this path when the module should create a hotspot and wait for local peers.

| Parameter | Var ID | Value / Purpose |
| :--- | :--- | :--- |
| `AMP_VARID_SSID` | `var08` | Access-point network name |
| `AMP_VARID_PASS_PHRASE` | `var09` | Access-point passphrase |
| `AMP_VARID_HOST_IP_ADDR` | `var11` | UDP Peer destination address |
| `AMP_VARID_HOST_PORT` | `var13` | UDP Peer destination port |
| `AMP_VARID_LOCAL_PORT` | `var14` | UDP local port and TCP Server listening port |
| `AMP_VARID_CHANNEL` | `var27` | Wi-Fi channel |
| `AMP_VARID_DEVICE_MODE` | `var28` | `AP` |

AT example:

```text
at+ab config var08=WF88_AP
at+ab config var09=12345678
at+ab config var14=2015
at+ab config var27=6
at+ab config var28=AP
```

Code example:

```c
wlan_config_info(AMP_VARID_DEVICE_MODE, "AP");
wlan_config_info(AMP_VARID_SSID, "WF88_AP");
wlan_config_info(AMP_VARID_PASS_PHRASE, "12345678");
wlan_config_info(AMP_VARID_CHANNEL, "6");
wlan_config_info(AMP_VARID_LOCAL_PORT, "2015");
```

### 2.4 MP

Use this path for Mesh deployment.

| Parameter | Var ID | Value / Purpose |
| :--- | :--- | :--- |
| `AMP_VARID_DHCP_MODE` | `var04` | `false` |
| `AMP_VARID_IP_ADDRESS` | `var05` | Static IPv4 address |
| `AMP_VARID_NET_MASK` | `var06` | Static IPv4 subnet mask |
| `AMP_VARID_GATE_WAY` | `var07` | Static IPv4 gateway |
| `AMP_VARID_CHANNEL` | `var27` | Mesh Wi-Fi channel |
| `AMP_VARID_DEVICE_MODE` | `var28` | `MP` |
| `AMP_VARID_MP_MODE` | `var31` | `1` |
| `AMP_VARID_MESH_ID` | `var61` | Mesh identifier |
| `AMP_VARID_MESH_PASS_PHRASE` | `var62` | Mesh passphrase |
| `AMP_VARID_MESH_AUTH_TYPE` | `var63` | Mesh authentication mode |

AT example:

```text
at+ab config var04=false
at+ab config var05=192.168.10.10
at+ab config var06=255.255.255.0
at+ab config var07=192.168.10.1
at+ab config var27=161
at+ab config var28=MP
at+ab config var31=1
at+ab config var61=mymesh123456789
at+ab config var62=12345678
at+ab config var63=2
```

Code example:

```c
wlan_config_info(AMP_VARID_DEVICE_MODE, "MP");
wlan_config_info(AMP_VARID_MP_MODE, "1");
wlan_config_info(AMP_VARID_CHANNEL, "161");
wlan_config_info(AMP_VARID_MESH_ID, "mymesh123456789");
wlan_config_info(AMP_VARID_MESH_AUTH_TYPE, "2");
wlan_config_info(AMP_VARID_MESH_PASS_PHRASE, "12345678");
wlan_config_info(AMP_VARID_DHCP_MODE, "false");
wlan_config_info(AMP_VARID_IP_ADDRESS, "192.168.10.10");
wlan_config_info(AMP_VARID_NET_MASK, "255.255.255.0");
wlan_config_info(AMP_VARID_GATE_WAY, "192.168.10.1");
```

## 3. Where to Modify Code

These are the main customer edit points.

- Demo boot gate: `Application/src/wifi_app.c`
  - `AMP_VARID_APP_AUTO_START` (`var64`) controls whether the demo command is registered and `vAppDemoMainTask()` is created at boot.

- Startup entry: `Application/src/app_demo.c`
  - `vAppDemoMainTask()`
  - This is the top-level app task.

- Enable or disable links: `Application/src/app_signal_adapter.c`
  - `app_demo_apply_link_policy()`
  - This maps `AMP_VARID_LINK_TYPE` (`var53`) to the enabled application links.
  - Change it only when the product requires a link policy different from the standard `LinkType` values.

- Extra MQTT runtime subscriptions: `Application/src/app_conn_mgr.c`
  - `app_conn_on_mqtt_connected()`
  - Add extra `wlan_mqtt_subscribe()` calls here after the broker connection is up.

- Auto-start link behavior: `Application/src/app_conn_mgr.c`
  - `app_conn_start_enabled_links()`
  - This is the actual link bring-up gate after Wi-Fi/IPv4 is ready.

- Downlink business parsing: `Application/src/app_business.c`
  - `app_default_rx_handler()`
  - Put your command parsing and reply generation here.

- Periodic telemetry uplink: `Application/src/app_business.c`
  - `app_default_telemetry_builder()`
  - Build your product telemetry here and choose the route.

- Periodic heartbeat uplink: `Application/src/app_business.c`
  - `app_default_heartbeat_builder()`
  - Build your keepalive payload here, or return `FALSE` to disable it.

## 4. First Code Change to Make

For the initial STA + MQTT test, `AMP_VARID_LINK_TYPE` (`var53`) selects the MQTT link. The first required application code change is to add one simple command parser in `Application/src/app_business.c`.

Suggested first check:

- make `app_default_rx_handler()` recognize one simple test command
- to send a reply, fill `reply_buf` and `*reply_len`, then return `TRUE`

`TRUE` tells `app_demo` that the command was handled and that the reply buffer must be sent through the selected route. Returning `FALSE` means "not handled"; any data placed in `reply_buf` is ignored and no reply is sent. Use `FALSE` only for commands that this handler does not recognize.

With only this change, you can verify that:

- downlink reaches `app_default_rx_handler()`
- reply routing still works

## 5. Run and Verify

> [!TIP]
> `app_demo` diagnostics are controlled by the compile-time `APP_LOG_LEVEL` macro in `Application/inc/app_log.h`. The default is `APP_LOG_LEVEL_ERROR`. Define `APP_LOG_LEVEL=APP_LOG_LEVEL_DEBUG` in the project preprocessor options when bring-up diagnostics are needed. Available levels are `APP_LOG_LEVEL_NONE`, `APP_LOG_LEVEL_ERROR`, `APP_LOG_LEVEL_INFO`, and `APP_LOG_LEVEL_DEBUG`. This setting affects `app_demo` logs only; SDK and AT logs use their own controls. Higher levels increase code size, RAM use, and UART output; use `APP_LOG_LEVEL_NONE` for the smallest production image.

> [!NOTE]
> **Serial Port Settings:** UART0, 115200 baud, 8 data bits, no parity, 1 stop bit (115200 8-N-1), no hardware flow control. Send AT commands with `\r\n` line endings.

After configuration and code edits:

1. Build and flash the firmware.
2. Confirm `AMP_VARID_APP_AUTO_START` (`var64`) is `true`.
3. Reset or power on the board.
4. Watch the UART log.
5. Send one test message.
6. Confirm that the expected business handler runs.

Use these log lines as the main checkpoints.

Demo startup (only when `var64=true`):

- `App Demo Main Event Task Started.`

Wi-Fi joined:

- `Signal: SIG_SDK_JOIN_SUCCESS`

IPv4 ready:

- `Signal: SIG_SDK_WLAN_IPV4_CHANGED`
- `IPv4 ready. if_id=... ip=...`

Link startup:

- `Starting enabled links. mode=...`
- `Connecting to MQTT Broker...`
- `Starting TCP Client connection...`
- `Starting UDP Peer connection...`
- `Starting TCP Server...`

MQTT ready:

- `MQTT Broker connected successfully!`

Business RX path:

- `Business RX from MQTT, ...`
- `Business RX from TCP_CLIENT, ...`
- `Business RX from TCP_SERVER, ...`
- `Business RX from UDP, ...`

Periodic uplink:

- `Business periodic telemetry via route=...`
- `Business periodic heartbeat via route=...`

If those logs appear in order, the framework is already running correctly.

## 6. Common Mistakes

- Using `AMP_VARID_SSID` (`var08`) or `AMP_VARID_PASS_PHRASE` (`var09`) for `app_demo` STA auto-connect.
  - Use `AMP_VARID_AUTO_SSID` (`var65`) and `AMP_VARID_PASS_PHRASE_ALT` (`var66`) instead. AP mode continues to use `AMP_VARID_SSID` (`var08`) and `AMP_VARID_PASS_PHRASE` (`var09`).

- Setting `AMP_VARID_APP_AUTO_START` (`var64`) after boot and expecting the demo to start immediately.
  - Reset or power-cycle after setting `var64=true`. With `var64=false`, `at+ab test` is intentionally unavailable.

- Enabling every link before one link is verified.
  - First bring up one path only.

- Forgetting to configure required parameters for the chosen link.
  - Missing parameters cause `CFG-*` errors and the link is skipped.

- Editing connection policy in the business layer.
  - Link enable/disable belongs in `app_demo_apply_link_policy()`.

- Editing business parsing in the signal path.
  - Put business parsing in `app_default_rx_handler()`, not in the signal dispatcher.

## 7. Recommended Reading Order

Read in this order:

1. This file
2. `W88M_API_Reference_Guide`
   - for full API details
3. `Application/src/app_demo.c`
4. `Application/src/app_signal_adapter.c`
5. `Application/src/app_conn_mgr.c`
6. `Application/src/app_business.c`
