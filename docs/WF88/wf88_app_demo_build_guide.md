# WF88 app_demo Build and Complete Firmware Package Guide

> This guide explains how to build the `app_demo` firmware with IAR Embedded Workbench and use the official `tools/ota_pack/make_ota_package.py` tool to create a complete firmware package containing the Platform and APP.

---

## 1. Overview and Scope

### 1.1 Purpose and Deliverables

This guide takes SDK developers through the complete workflow from source-code changes to device verification: modifying and configuring `app_demo`, building the `WifiSDK` project, post-processing it with dynamic memory paging technology (hereinafter referred to as VPAGE), generating an installable APP image, directly uploading the APP or creating a complete firmware package as appropriate, and checking the APP and boot Slot status on the device.

`app_demo` is not a separately built firmware project. It is linked into the APP image as part of the `WifiSDK` project, together with the base Wi-Fi functions, AT commands, and user business code. Therefore, “building app_demo” in this guide means building the complete WF88 APP firmware that includes `app_demo`.

The procedure may produce the following deliverables:

| Deliverable | Purpose | Installed directly on the device |
| --- | --- | --- |
| `EWARM/WifiSDK/Exe/WifiApp_C.bin` | Final APP firmware reorganized and verified by VPAGE; it can be uploaded directly to a Slot or used as the APP component of a complete firmware package | Yes |
| `firmware.pkg` | Complete release package containing the Platform and APP | Yes |
| `EWARM/WifiSDK/Exe/ACH.out` | IAR linker output that retains symbols and section information and can be used with `ACH.map` for offline analysis | No |
| `EWARM/WifiSDK/List/ACH.map` | Linker map used to analyze ROM, RAM, and VPAGE section layout | No |

The `EWARM/WifiSDK/Exe/WifiApp.bin` file generated directly by IAR is the input to VPAGE post-processing, not the final release firmware defined by this guide. Always use `WifiApp_C.bin` for direct APP uploads and complete firmware packaging.

This guide focuses on building, packaging, and verification. See `Quick_Start.md` for business parameters and code changes in `app_demo`. See `wf88_bootloader_guide.md` for Bootloader menus, firmware installation, and Slot management.

- **1.2 Intended audience**
  - SDK application developers, system integration engineers, and firmware release and maintenance personnel.
- **1.3 Related documents**
  - `Quick_Start.md`: app_demo quick start and business parameter configuration.
  - `wf88_bootloader_guide.md`: WF88 Bootloader operation, individual APP upload, complete firmware installation, and Slot management.
  - `README.md`: WLAN API reference manual.

---

## 2. Prerequisites

This chapter covers only the environment required to build, transfer, and verify firmware. The actual build commands begin in Chapter 4.

### 2.1 Development Computer and Hardware

The build environment requires:

- A Windows development computer. IAR Embedded Workbench and the repository's `build_wifisdk.bat` run on Windows;
- A WF88-M / ACH118x evaluation board, or customer hardware using the same chip and Flash layout;
- A USB-to-UART interface connected to the device control UART. No additional adapter is required if the evaluation board already integrates a UART converter;
- A stable power supply suitable for the target hardware.

VPAGE is enabled in the current SDK. Because the final firmware dynamically loads overlay pages at runtime, normal source-level breakpoint debugging with IAR C-SPY / J-Link is not supported. J-Link is not required for the build and verification workflow in this guide. Troubleshooting should primarily use UART logs, `ACH.map`, task stack information, and device behavior.

Before device verification, the target must have a WF88 Bootloader that supports Stage 1 and the Dual-slot layout, together with Platform firmware compatible with the APP under test. See `wf88_bootloader_guide.md` for Bootloader installation, recovery, and Slot checks.

> [!CAUTION]
> Keep the power supply and UART connection stable while uploading firmware. Do not reset the device, disconnect the UART, or remove power during file transfer or Flash programming.

### 2.2 IAR Embedded Workbench

This project is built with IAR Embedded Workbench for ARM (EWARM), version 7.2 or later. The toolchain version recorded in the current `DevSuite.ewp` project is `7.20.2.7418`.

When installing IAR, confirm that:

- The ARM toolchain is installed and has a valid license;
- `EWARM/Workspace.eww` opens correctly;
- The `WifiSDK` build configuration can be selected in the `DevSuite` project;
- The referenced prebuilt library `lib/WifiSDK.a` exists and is readable.

The automated build script searches for `iarbuild.exe` on drives `C:`, `D:`, and `E:` under the following default path:

```text
\Program Files (x86)\IAR Systems\Embedded Workbench 7.0\common\bin\iarbuild.exe
```

If IAR is installed on another drive or in a custom directory, `build_wifisdk.bat` displays:

```text
[ERROR] iarbuild.exe not found
```

In that case, either build manually with the IAR IDE and run VPAGE post-processing as described in Section 4.2, or update the `iarbuild.exe` search path in `build_wifisdk.bat` to match the actual installation.

### 2.3 Python Environment

The VPAGE post-processing and complete firmware packaging tools use Python. Python 3.8 or later is recommended. The scripts use only the Python standard library and require no additional pip packages.

Run the following command in Command Prompt to verify that Python is available:

```cmd
python --version
```

If Python is managed through the Python Launcher, use:

```cmd
py -3 --version
```

`build_wifisdk.bat` first tries `python`, then `py -3`. If neither command is available, it displays:

```text
[ERROR] python not found
```

### 2.4 Firmware Transfer Tool and UART Settings

Use Amp'ed RF Firmware Tool to upload an APP or complete firmware package to the device. Select the correct serial port and use these settings:

| Parameter | Setting |
| --- | --- |
| Baudrate | `115200` |
| Data bits | `8` |
| Stop bits | `1` |
| Parity | `None` |
| Flow control | `None` |

If the device supplier provides an Amp'ed RF Firmware Tool Profile, load that Profile instead of changing its parameters manually. To send a file, select it in the tool and click `load`.

### 2.5 SDK Directory and Key Files

All subsequent commands assume that the current directory is the SDK root containing `build_wifisdk.bat`, `Application/`, `EWARM/`, and `tools/`.

Before building, confirm that these files exist:

| Path | Purpose |
| --- | --- |
| `EWARM/Workspace.eww` | IAR workspace entry point |
| `EWARM/DevSuite.ewp` | `DevSuite` project and `WifiSDK` build configuration |
| `lib/WifiSDK.a` | Prebuilt Wi-Fi SDK static library |
| `build_wifisdk.bat` | Automates the IAR build and VPAGE post-processing |
| `tools/vpage_pack.py` | Reorganizes IAR output into the final `WifiApp_C.bin` and verifies it |
| `tools/ota_pack/make_ota_package.py` | Generates a complete firmware package from a JSON Manifest |
| `tools/ota_pack/manifest.json` | Complete firmware package Manifest; update the firmware version and APP filename before packaging |

The following directories are used or generated during the build:

| Path | Contents |
| --- | --- |
| `EWARM/WifiSDK/Exe/` | `ACH.out`, intermediate `WifiApp.bin`, and final `WifiApp_C.bin` |
| `EWARM/WifiSDK/List/` | Linker map file `ACH.map` |
| `EWARM/WifiSDK/Obj/` | Object and intermediate files generated by IAR |

If `lib/WifiSDK.a`, a project file, or a tool script is missing, obtain a complete SDK release package. Do not mix individually copied files from different versions.

---

## 3. Configuring app_demo

`app_demo` is an executable reference application built on the base Wi-Fi SDK. It reads the saved Wi-Fi, IP, MQTT, TCP, and UDP settings and organizes them into this application flow:

```text
Saved configuration
  -> Wi-Fi connection
  -> IPv4 or IPv6 ready
  -> enabled MQTT/TCP/UDP links
  -> product business callbacks
```

It monitors Wi-Fi and IP status, starts selected network connections, reconnects after disconnection, dispatches received data, and provides periodic telemetry and heartbeat functions. `app_demo` is not required by the base Wi-Fi or standard AT functions, nor is it a ready-to-ship product application. Developers should retain its connection and event framework and add product logic at the designated business entry points.

### 3.1 app_demo Startup Conditions

Whether app_demo runs is determined jointly by one compile-time switch and one runtime switch. The interactive test command has a separate compile-time switch.

#### `AMP_SDK_DEMO`: Integrating app_demo

`AMP_SDK_DEMO` is the top-level compile-time feature macro for app_demo. It is already defined in the current IAR `WifiSDK` build configuration under `Project → Options → C/C++ Compiler → Preprocessor → Defined symbols`.

Only when `AMP_SDK_DEMO` is defined does `Application/src/wifi_app.c` include the app_demo interfaces, read `AMP_VARID_APP_AUTO_START`, and create the AppDemo task according to its value. Without this macro, base Wi-Fi initialization, standard AT commands, and the FreeRTOS scheduler still start normally, but the AppDemo tasks and `at+ab test` are not integrated.

> [!NOTE]
> The app_demo source files remain listed in the IAR project. Therefore, `AMP_SDK_DEMO` controls compile-time integration between app_demo and the main application; it does not remove those source files from the project. To exclude them completely at the project level, also set the corresponding files to Exclude from Build in IAR.

Rebuild the firmware after changing `AMP_SDK_DEMO`.

#### `AMP_VARID_APP_AUTO_START`: Starting the AppDemo Task

`AMP_VARID_APP_AUTO_START` (AT parameter `var64`) is a runtime switch stored in device configuration and defaults to `false`. The firmware creates `vAppDemoMainTask()` only when `AMP_SDK_DEMO` is defined at build time and `AMP_VARID_APP_AUTO_START=true` is read during device startup.

Enable it with this AT command:

```text
at+ab config var64=true
```

`AMP_VARID_APP_AUTO_START` is read during startup. Reset or power-cycle the device after changing it; a currently running firmware image does not immediately create or stop AppDemo tasks. A factory configuration reset or erasure of Config A/B restores `AMP_VARID_APP_AUTO_START` to its default, so it must be set again.

When `AMP_VARID_APP_AUTO_START=false`:

- Base Wi-Fi and standard AT functions continue to run;
- The AppDemo main task, connection management task, and business task do not start;
- `at+ab test` is not registered, even if `APP_DEMO_CLI_ENABLE=1`.

#### `APP_DEMO_CLI_ENABLE`: Enabling Interactive Test Commands

`APP_DEMO_CLI_ENABLE` is a compile-time switch with a default value of `1`. It controls whether `at+ab test` and interactive helper code for GPIO, Timer, and similar functions are included in the final firmware.

- `APP_DEMO_CLI_ENABLE=1`: registers `at+ab test` when AppDemo starts;
- `APP_DEMO_CLI_ENABLE=0`: does not register `at+ab test`, without affecting the AppDemo main task, automatic network connection, business data processing, telemetry, or heartbeat.

To override the default, add the following to IAR `Defined symbols`:

```text
APP_DEMO_CLI_ENABLE=0
```

The three switches produce the following behavior:

| `AMP_SDK_DEMO` | `AMP_VARID_APP_AUTO_START` | `APP_DEMO_CLI_ENABLE` | AppDemo tasks | `at+ab test` |
| --- | --- | --- | --- | --- |
| Not defined | Any value | Any value | Not started | Not registered |
| Defined | `false` | Any value | Not started | Not registered |
| Defined | `true` | `0` | Started | Not registered |
| Defined | `true` | `1` | Started | Registered |

### 3.2 Main Source Entry Points

Each file is responsible for a different layer. Product development should normally focus on the business layer and user configuration. Do not place product command parsing directly in Wi-Fi signal or reconnection flows.

| File | Main responsibility | Recommendation |
| --- | --- | --- |
| `Application/src/wifi_app.c` | Initializes base Wi-Fi and integrates AppDemo according to `AMP_SDK_DEMO` and `var64` | Normally leave unchanged; do not add a product business loop here |
| `Application/src/app_demo.c` | Entry point for `vAppDemoMainTask()`; loads configuration and starts connection management, the business layer, and signal dispatch in sequence | Normally leave unchanged; retain it as the top-level assembly entry point |
| `Application/src/app_business.c` | Processes downstream business data, generates replies, periodic telemetry, and heartbeat data | Primary modification point for product development |
| `Application/inc/app_user_config.h` | Configures periods, buffers, task stacks, and queue depths | Adjust according to product data volume and task stack high-water marks |
| `Application/src/app_signal_adapter.c` | Subscribes to SDK signals and converts `var53` into enabled MQTT/TCP/UDP links | Modify only when a product needs a different link policy or signal subscription |
| `Application/src/app_conn_mgr.c` | Starts connections, tracks connection state, and performs reconnect backoff | Normally leave unchanged; modify the connection-success handling when additional MQTT subscriptions are required |
| `Application/src/app_route.c` | Sends business data through the currently available MQTT, TCP, or UDP path | Modify only when a product needs a new routing policy |
| `Application/src/app_demo_cli.c` | Implements interactive test commands under `at+ab test` | For development and testing only; do not place production business logic here |
| `Application/inc/app_log.h` | Controls the compile-time app_demo log level | Increase for integration testing and adjust for release logging requirements |

#### Business Data Processing

MQTT, TCP, UDP, and subscribed UART data eventually enters `app_default_rx_handler()` in `Application/src/app_business.c`. Implement the following in the area marked `USER CODE BEGIN: RX Handler`:

1. Parse `payload` according to `rx->len`; do not assume the input is terminated by `\0`;
2. Perform the corresponding product action;
3. When a reply is required, write it to `reply_buf`, set `*reply_len`, and return `TRUE`;
4. Return `FALSE` for an unrecognized command; no reply is then sent.

By default, replies are sent through the same link on which the command was received. If the product must reply over another link, explicitly call that link's send API.

#### Periodic Telemetry and Heartbeat

`app_default_telemetry_builder()` generates periodic telemetry and `app_default_heartbeat_builder()` generates heartbeat data. Their periods are controlled by these macros in `Application/inc/app_user_config.h`:

```c
#define APP_TELEMETRY_PERIOD_MS  80000U
#define APP_HEARTBEAT_PERIOD_MS  80000U
```

The data is sent when a Builder returns `TRUE`; returning `FALSE` skips that cycle. If a product does not need the corresponding feature, make the Builder return `FALSE` instead of retaining meaningless sample data.

#### Buffers, Task Stacks, and Queues

`Application/inc/app_user_config.h` also defines the MQTT reassembly buffer, periodic data buffers, AppDemo/reconnect/business task stacks, and business and signal queue depths. Task stack sizes are measured in FreeRTOS words, not bytes. After increasing buffers or local arrays, or making business processing more complex, use `at+wf showstack` to check task stack high-water marks before deciding whether to adjust stack sizes.

#### app_demo Logging

`APP_LOG_LEVEL` controls compile-time logging for app_demo and supports these levels:

| Level | Effect |
| --- | --- |
| `APP_LOG_LEVEL_NONE` | Disables app_demo logging |
| `APP_LOG_LEVEL_ERROR` | Keeps error messages only |
| `APP_LOG_LEVEL_INFO` | Prints errors and major status messages; current default |
| `APP_LOG_LEVEL_DEBUG` | Prints detailed signal, configuration, and connection diagnostics |

To override the default level, add a definition such as this to IAR `Defined symbols`:

```text
APP_LOG_LEVEL=APP_LOG_LEVEL_DEBUG
```

Higher log levels increase code size, UART output, and runtime overhead. This macro controls only app_demo logs, not SDK, AT, or Bootloader logs.

### 3.3 Configuration Checks Before Modification

Compile-time options are embedded in the firmware image and require a rebuild and upload. Runtime parameters are stored in Config A/B, are normally set through `at+ab config`, and generally take effect after the next reset or power cycle.

| Type | Main items | How changes take effect |
| --- | --- | --- |
| Compile-time | `AMP_SDK_DEMO`, `APP_DEMO_CLI_ENABLE`, `APP_LOG_LEVEL`, and macros in `app_user_config.h` | Rebuild and upload the APP |
| Runtime | `var64`, device mode, address type, link type, and Wi-Fi and MQTT/TCP/UDP parameters | Save the configuration, then reset or power-cycle |

Before changing business code, check the following in order:

1. Keep `AMP_SDK_DEMO` defined in the `WifiSDK` configuration;
2. Set `APP_DEMO_CLI_ENABLE` according to whether field test commands are required;
3. Implement the minimum business receive and reply logic in `app_business.c`;
4. Check buffers, task stacks, and queues in `app_user_config.h` against the data size and processing complexity;
5. Follow `Quick_Start.md` to select STA, AP, or MP mode and configure IPv4/IPv6 and the required links;
6. Set `AMP_VARID_APP_AUTO_START` (`var64`) to `true`;
7. After building as described in Chapter 4 and uploading as described in Chapter 5, reset the device for verification.

`AMP_VARID_LINK_TYPE` (`var53`) determines which business links app_demo starts automatically:

| `var53` | Automatically enabled links |
| --- | --- |
| `0` | TCP Client, UDP Peer, and TCP Server |
| `1` | MQTT |
| `2` | MQTT, TCP Client, UDP Peer, and TCP Server |

`AMP_VARID_ADDR_TYPE` (`var52`) selects the address type for business links: `0` for IPv4 and `1` for IPv6. Each mode requires multiple SSID, password, address, port, Topic, and authentication parameters, which are not repeated here. Configure them using the parameter table for the target network mode in `Quick_Start.md`.

---

## 4. Building the Final APP Firmware

An IAR build completing successfully is not the final step for this project. IAR first generates the intermediate `WifiApp.bin` containing the VPAGE load area. You must then run `tools/vpage_pack.py` to extract and rearrange the VPAGE pages, append VPAGE descriptor information, perform consistency checks, and generate the installable `WifiApp_C.bin`.

```text
IAR source build
  -> WifiApp.bin + ACH.map
  -> vpage_pack.py
  -> WifiApp_C.bin
```

> [!IMPORTANT]
> Always use `WifiApp_C.bin` for a direct APP upload or complete firmware package. Do not upload IAR's `WifiApp.bin` to a device or include it in a firmware package.

### 4.1 Recommended Method: Automated Build Script

`build_wifisdk.bat` automatically:

1. Locates `iarbuild.exe`;
2. Builds `EWARM/DevSuite.ewp` with the `WifiSDK` configuration;
3. Checks that `WifiApp.bin` and `ACH.map` were generated;
4. Locates Python 3;
5. Runs `tools/vpage_pack.py`;
6. Verifies and outputs `WifiApp_C.bin`.

Open Windows Command Prompt, change to the SDK root, and run the following for a normal incremental build:

```cmd
build_wifisdk.bat
```

With no argument, the script passes `-make` to IAR, rebuilding only files that changed or are affected by a change.

For a release build, after switching branches, or after updating headers or prebuilt libraries, perform a full rebuild:

```cmd
build_wifisdk.bat clean
```

The `clean` argument causes the script to pass `-build` to IAR and rebuild every file in the `WifiSDK` configuration. It does not delete source or SDK files.

The script first displays the IAR path and project configuration:

```text
[BUILD] iarbuild: <path-to-iarbuild.exe>
[BUILD] EWARM\DevSuite.ewp (WifiSDK)
```

After IAR completes, the script starts VPAGE reorganization and verification. Section sizes vary as code changes. A successful run ends with:

```text
[PACK] verify & repack firmware ...
[VPAGE] [1] Magic: OK
[VPAGE] [2] CRC32: OK (<crc32>)
[VPAGE] [3] Layout: OK
[VPAGE] [4] Resident size: OK
[VPAGE] === 全部校验通过 ===
[VPAGE] Done: EWARM\WifiSDK\Exe\WifiApp_C.bin

[DONE] firmware: EWARM\WifiSDK\Exe\WifiApp_C.bin
```

The final APP build is complete only when all of these conditions are met:

- IAR reports no compile or link errors;
- The VPAGE tool displays `=== 全部校验通过 ===`;
- The script displays `[DONE] firmware: EWARM\WifiSDK\Exe\WifiApp_C.bin`.

If the script displays `[ERROR]` or exits before VPAGE verification finishes, do not use an existing `WifiApp_C.bin` in the directory because it may be left over from a previous build.

### 4.2 Building with the IAR IDE

To inspect complete build information or use the IAR GUI, perform the equivalent process manually:

1. Start IAR Embedded Workbench.
2. Open `EWARM/Workspace.eww`.
3. Select the `DevSuite` project in the Workspace.
4. Confirm that the active build configuration is `WifiSDK`.
5. Select `Project → Rebuild All` and wait for compilation and linking to finish.
6. Confirm that IAR displays `Total number of errors: 0`.

IAR `Rebuild All` produces only the files required as VPAGE post-processing inputs; it does not automatically produce a final `WifiApp_C.bin` for that build. With IAR either open or closed, run this command from the SDK root:

```cmd
python tools\vpage_pack.py --bin "EWARM\WifiSDK\Exe\WifiApp.bin" --map "EWARM\WifiSDK\List\ACH.map" --out "EWARM\WifiSDK\Exe\WifiApp_C.bin"
```

If the computer uses the Python Launcher, run:

```cmd
py -3 tools\vpage_pack.py --bin "EWARM\WifiSDK\Exe\WifiApp.bin" --map "EWARM\WifiSDK\List\ACH.map" --out "EWARM\WifiSDK\Exe\WifiApp_C.bin"
```

A manual run must also display:

```text
[VPAGE] === 全部校验通过 ===
[VPAGE] Done: EWARM\WifiSDK\Exe\WifiApp_C.bin
```

If code is changed after the IAR build, repeat both the IAR build and VPAGE post-processing. Do not reuse the previous `WifiApp_C.bin`.

### 4.3 Build Outputs and Their Uses

The main outputs after a successful build are:

| File | Generated by | Purpose |
| --- | --- | --- |
| `EWARM/WifiSDK/Exe/ACH.out` | IAR linker | Contains symbols and section information and can be used with `ACH.map` for offline analysis; it cannot be used for normal source-level breakpoint debugging when VPAGE is enabled |
| `EWARM/WifiSDK/List/ACH.map` | IAR linker | Used to analyze ROM, RAM, linker symbols, and VPAGE layout; also an input to `vpage_pack.py` |
| `EWARM/WifiSDK/Exe/WifiApp.bin` | IAR binary output | Intermediate file containing the uncompressed VPAGE load layout; used only as input to `vpage_pack.py` |
| `EWARM/WifiSDK/Exe/WifiApp_C.bin` | VPAGE post-processing | Final APP firmware used for a direct APP upload or as the APP component in a complete firmware package |

`WifiApp_C.bin` contains VPAGE descriptor information at the end of the file. Renaming or copying `WifiApp.bin` does not produce a valid `WifiApp_C.bin`.

### 4.4 Checking the Build Result

Before uploading or packaging:

1. Confirm that `WifiApp_C.bin` came from the current build; its modification time should be later than the start of the current IAR build;
2. Confirm that the VPAGE tool reported no `ERROR`, `FAIL`, CRC mismatch, or layout mismatch;
3. Confirm that the final file is not empty and does not exceed the usable capacity of one APP file in the Dual-slot layout: `765952` bytes (748 KiB);
4. Save the corresponding `ACH.map` for a release build so that firmware size and linker issues can be investigated later;
5. Record the source version, build configuration, and generated file names and sizes to avoid mixing APP and Platform versions.

Use this command at the SDK root to inspect the final file:

```cmd
dir EWARM\WifiSDK\Exe\WifiApp_C.bin
```

If `WifiApp_C.bin` exceeds 748 KiB, it cannot be written to a Slot even if VPAGE verification passes. Reduce APP code or data usage and rebuild.

---

## 5. Daily Development: Direct APP Deployment

For daily development that changes only APP code, directly uploading `WifiApp_C.bin` is the fastest way to test and avoids creating a complete firmware package each time.

A direct APP upload formats and updates the selected Slot without changing the other Slot or the Platform. After the upload, manually select that Slot before the device can trial the new APP.

### 5.1 Use Cases and Limitations

A direct APP upload is appropriate when:

- Only app_demo or product business code under `Application/` has changed;
- The same version of `lib/WifiSDK.a` and its matching Platform firmware are used;
- A fast build, upload, and device test cycle is required;
- The Platform does not need to be updated at the same time.

> [!IMPORTANT]
> Upload the verified `EWARM/WifiSDK/Exe/WifiApp_C.bin` generated in Chapter 4. Do not upload the intermediate `WifiApp.bin`.

The APP must be compatible with the Platform already installed on the device. If the prebuilt SDK library or Platform components have changed, or a version boundary requires a matching Platform update, use the complete firmware package described in Chapter 6 instead of updating only the APP.

### 5.2 Selecting the Target Slot

Before uploading, follow Chapter 3 of `wf88_bootloader_guide.md` to check the currently selected boot Slot. Using the other Slot as the upload target is recommended so that the current confirmed APP is preserved:

- If Slot A is current, upload to Slot B;
- If Slot B is current, upload to Slot A.

The current Slot can also be selected, but the complete target Slot is erased before the upload begins. If the transfer fails or the new APP fails validation, the Slot no longer contains its previous bootable APP. Using the other Slot preserves a rollback path if testing of the new version fails.

The following procedure assumes that Slot A is current and the new APP is uploaded to Slot B.

### 5.3 Uploading `WifiApp_C.bin`

Before starting, confirm that:

- The modification time and file size of `WifiApp_C.bin` match the current build;
- The file is no larger than 748 KiB;
- Amp'ed RF Firmware Tool is using the correct serial port and `115200` Baudrate;
- Device power and the UART connection are stable.

After entering the Stage 1 menu:

1. Enter `4` for `Advanced Maintenance`.
2. Enter `2` for `File and platform update`.
3. Enter `1` for `Upload individual files`.
4. Enter `2` for Slot B. Enter `1` when uploading to Slot A.
5. Enter `1` for `Application image`.
6. Enter `Y` to confirm erasure of the target Slot.
7. When `C` appears, select `EWARM/WifiSDK/Exe/WifiApp_C.bin` in Amp'ed RF Firmware Tool and click `load`.
8. Keep power and connections stable while the device writes and verifies the file.

The complete UART interaction is:

```text
#4

Advanced Maintenance
 1. Boot control
 2. File and platform update
 3. Storage management
 4. Update Stage 0
 0. Back
#2

File and Platform Update
Use this menu only for service or development.
 1. Upload individual files
 2. Platform firmware
 3. Upload Custom file
 4. Finalize Slot A and initialize Metadata
 0. Back
#1

Select Upload Slot
 1. Slot A
 2. Slot B
 0. Back
#2

Upload Individual Files to Slot B
 1. Application image
 0. Back
#1
WARNING: erase all of Slot B before uploading the application image. A failed transfer will leave no usable application. Continue? [Y/N] Y
Send a file with YMODEM now
C
File committed

Upload Individual Files to Slot B
 1. Application image
 0. Back
#
```

`File committed` means that the complete file was transferred and written to the target Slot. If the following message appears afterward:

```text
Application image validation failed
```

the new APP did not pass boot validation. Do not select that Slot for boot. Confirm that the uploaded file is `WifiApp_C.bin`, that its size is correct, and that it is compatible with the current Platform, then upload it again.

If the transfer is interrupted or `File committed` does not appear, the target Slot has already been erased; do not assume that it still contains the old APP. You can remain in the current menu and upload again. As long as the confirmed APP in the other Slot remains valid, the failure does not modify that Slot.

### 5.4 Selecting and Starting the New APP

A successful upload changes only the Slot contents; it does not automatically change the next boot target. Return to `Boot Menu` and manually select the updated Slot B.

Return from `Upload Individual Files to Slot B` and enter the Slot selection menu:

```text
Upload Individual Files to Slot B
 1. Application image
 0. Back
#0

Select Upload Slot
 1. Slot A
 2. Slot B
 0. Back
#0

File and Platform Update
Use this menu only for service or development.
 1. Upload individual files
 2. Platform firmware
 3. Upload Custom file
 4. Finalize Slot A and initialize Metadata
 0. Back
#0

Advanced Maintenance
 1. Boot control
 2. File and platform update
 3. Storage management
 4. Update Stage 0
 0. Back
#1

Boot Menu
 1. Boot active package
 2. Select Boot Slot
 3. Check Slot A
 4. Check Slot B
 0. Back
#2

Select Boot Slot
 1. Slot A, Image: <current-app> (current)
 2. Slot B, Image: WifiApp_C.bin
 0. Back
#2
Slot B selected for the next boot (pending trial)

Select Boot Slot
 1. Slot A, Image: <current-app>
 2. Slot B, Image: WifiApp_C.bin (current)
 0. Back
#
```

`<current-app>` is the actual filename of the existing APP in Slot A. Once selected, Slot B becomes the pending trial target for the next boot.

Enter `0` to return to `Boot Menu`, then select `1. Boot active package`:

```text
Boot Menu
 1. Boot active package
 2. Select Boot Slot
 3. Check Slot A
 4. Check Slot B
 0. Back
#1
Starting WifiApp_C.bin from Slot B
```

Alternatively, reset the device and let the Bootloader start Slot B automatically. After the new APP initializes successfully, Slot B becomes the confirmed Slot. If image validation fails or the trial is not confirmed, the Bootloader falls back to the original confirmed Slot according to the mechanism described in Chapter 3 of `wf88_bootloader_guide.md`.

After startup, follow Chapter 5 of `Quick_Start.md` to verify AppDemo and the business links.

### 5.5 Difference from Complete Firmware Installation

| Item | Direct APP upload | Complete firmware installation |
| --- | --- | --- |
| APP | Updates only the selected Slot | Installs into Slot A and clears Slot B |
| Platform | Preserved | Reinstalled from the package |
| Boot Slot | Must be selected manually after upload | Initialized as confirmed Slot A after successful installation |
| Primary use | Daily APP development and testing | Initial installation, cross-version upgrade, and complete recovery |

A direct APP upload cannot update the Platform or repair partition layout problems. To update both the Platform and APP, create the complete firmware package described in Chapter 6.

---

## 6. Creating a Complete Firmware Package

The complete firmware package is always named `firmware.pkg`. It contains the Platform files for the current SDK version and the final APP firmware generated in Chapter 4. Use it when releasing an SDK, updating the Platform, delivering across versions, or completely recovering a device.

### 6.1 Preparing the Platform and APP Files

Packaging requires these four files:

| Component | SDK path | Purpose |
| --- | --- | --- |
| Platform | `tools/ota_pack/sdd_6010.bin` | Platform startup parameter file |
| Platform | `tools/ota_pack/bootloader.bin` | Platform firmware file |
| Platform | `tools/ota_pack/wsm_V3.2.3.bin` | Low-level Wi-Fi firmware file |
| APP | `EWARM/WifiSDK/Exe/WifiApp_C.bin` | Final APP firmware from the current build after VPAGE post-processing |

All three Platform files must come from the current SDK release. Do not copy or mix files from another SDK version. The APP must be the `WifiApp_C.bin` from the current build that passed VPAGE verification, not the intermediate `WifiApp.bin`.

Also confirm before packaging that `WifiApp_C.bin` does not exceed the usable capacity of one APP Slot: `765952` bytes (748 KiB).

### 6.2 Preparing the Manifest

Edit the existing `tools/ota_pack/manifest.json` in the SDK. This example uses release version `260917A`:

```json
{
  "target_id": "WF88M",
  "firmware_version": "260917A",
  "rollback_counter": 0,
  "components": [
    {
      "type": "FILE",
      "destination": "PLATFORM",
      "filename": "sdd_6010.bin",
      "source": "sdd_6010.bin",
      "replace_partition": true
    },
    {
      "type": "FILE",
      "destination": "PLATFORM",
      "filename": "bootloader.bin",
      "source": "bootloader.bin",
      "replace_partition": true
    },
    {
      "type": "FILE",
      "destination": "PLATFORM",
      "filename": "wsm_V3.2.3.bin",
      "source": "wsm_V3.2.3.bin",
      "replace_partition": true
    },
    {
      "type": "APP",
      "destination": "TARGET_SLOT",
      "filename": "WifiApp_260917A.bin",
      "source": "../../EWARM/WifiSDK/Exe/WifiApp_C.bin",
      "replace_partition": true
    }
  ]
}
```

Before release, replace `260917A` with the actual firmware version and use the same version identifier in `firmware_version` and the APP filename. The output package name remains `firmware.pkg`.

The top-level Manifest fields describe the complete package:

| Field | Setting in this chapter | Meaning and requirements |
| --- | --- | --- |
| `target_id` | `WF88M` | Target product identifier; fixed as `WF88M` |
| `firmware_version` | `260917A` | Release version; must be a non-empty ASCII string shorter than 32 bytes; replace it with the actual version before release |
| `rollback_counter` | `0` | Package rollback counter; keep it at `0` in this chapter |
| `components` | Array of component objects | Lists every file in the package; this chapter uses exactly three Platform components and one APP component |

Each object in `components` describes one packaged file:

| Field | Example | Meaning and requirements |
| --- | --- | --- |
| `type` | `APP` | Component type, which determines whether the file is a regular file or a bootable APP; available values are listed below |
| `destination` | `TARGET_SLOT` | Component destination; available values and valid combinations with `type` are listed below |
| `filename` | `WifiApp_260917A.bin` | Filename written to the device; the APP filename should include the release version |
| `source` | `../../EWARM/WifiSDK/Exe/WifiApp_C.bin` | Input path on the packaging computer; relative paths are resolved from the directory containing the Manifest |
| `replace_partition` | `true` | Whether to replace the target partition contents before installing the component; set to `true` for every Platform and APP component in this chapter |

`type` specifies the component type. This complete package uses:

| `type` value | Meaning | Files in this chapter |
| --- | --- | --- |
| `FILE` | Regular file component whose write location is determined by `destination` | `sdd_6010.bin`, `bootloader.bin`, `wsm_V3.2.3.bin` |
| `APP` | Bootable APP image; a package must contain exactly one APP component | `WifiApp_C.bin` |

`destination` specifies the component destination. This complete package uses:

| `destination` value | Meaning | Allowed `type` |
| --- | --- | --- |
| `PLATFORM` | Installs the file into the Platform partition | `FILE` |
| `TARGET_SLOT` | Installs the APP into the target Slot; a complete firmware installation targets Slot A | `APP` |

This chapter uses only these two valid combinations:

| `type` | `destination` | Purpose |
| --- | --- | --- |
| `FILE` | `PLATFORM` | Installs the three Platform files |
| `APP` | `TARGET_SLOT` | Installs the final APP firmware |

`type` and `destination` are case-sensitive and must use the uppercase strings in the tables. Do not declare a Platform file as `APP` or set an APP destination to `PLATFORM`; otherwise, packaging or installation validation fails.

Relative `source` paths are resolved from the directory containing the Manifest. Because `tools/ota_pack/manifest.json` and the three Platform files are in the same directory, each Platform `source` is only its filename. The APP uses `../../EWARM/WifiSDK/Exe/WifiApp_C.bin` to reference the SDK build output.

### 6.3 Generating `firmware.pkg`

Open Windows Command Prompt, change to the SDK root, and run:

```cmd
python tools\ota_pack\make_ota_package.py --manifest tools\ota_pack\manifest.json --output firmware.pkg
```

If the computer uses the Python Launcher, run:

```cmd
py -3 tools\ota_pack\make_ota_package.py --manifest tools\ota_pack\manifest.json --output firmware.pkg
```

On success, the tool prints output similar to:

```text
wrote firmware.pkg: <package-bytes> bytes, header=420 bytes, components=4
```

When generating the package, the tool calculates the Header CRC32, the CRC32 of each component, and the SHA-256 of the complete Payload. If an input file is missing or empty, a field has the wrong type or exceeds its length limit, or the component configuration is invalid, the tool reports an error and stops.

### 6.4 Checking the Package

Complete at least these checks before release:

1. Confirm that the command reports `components=4` and does not exit abnormally or display an error;
2. Confirm that `firmware.pkg` is not empty and its modification time matches the current packaging operation;
3. Check `firmware_version` and the APP `filename` in the Manifest to ensure that they are not left at the example or previous release version;
4. Confirm that all three Platform files come from the current SDK version;
5. Confirm that the APP `source` points to the `WifiApp_C.bin` from the current build that passed VPAGE verification;
6. Archive the Manifest, `firmware.pkg`, corresponding `ACH.map`, and source version together.

Run the packaging tool self-test to verify the built-in package generation logic in the current SDK:

```cmd
python tools\ota_pack\test_make_ota_package.py
```

Or:

```cmd
py -3 tools\ota_pack\test_make_ota_package.py
```

A successful test displays:

```text
.......
----------------------------------------------------------------------
Ran 7 tests in <time>s

OK
```

This test checks the packaging tool's format generation and error handling. It does not replace verification of the current `firmware.pkg` version, its input files, or installation on a device.

### 6.5 Device Upgrade References

Use the appropriate document for the current device state:

- To upgrade a device with the legacy Bootloader to the Stage 0 + Stage 1 architecture and install complete firmware, see [`wf88_bootloader_upgrade_guide.md`](wf88_bootloader_upgrade_guide.md);
- To install complete firmware, select a boot Slot, or perform recovery on a device already using the current Bootloader, see [`wf88_bootloader_guide.md`](wf88_bootloader_guide.md).

---

## 7. Updating the APP over OTA

After the device is running normally and connected to the network, it can download the `firmware.pkg` generated in Chapter 6 over HTTP. OTA verifies the package and writes its APP to the Slot that is not currently running. After the download, the user confirms and applies the switch, and the new APP runs as a pending trial on the next boot.

> [!IMPORTANT]
> Application-side OTA does not update the Platform. Although the `firmware.pkg` generated in Chapter 6 contains both Platform and APP components, OTA writes only the APP component; the Platform components participate only in integrity verification. To update both the Platform and APP, install the complete firmware package as described in `wf88_bootloader_guide.md`.

> [!CAUTION]
> The current `firmware.pkg` is not digitally signed, and OTA uses unencrypted HTTP. CRC32 and SHA-256 detect transfer corruption but cannot authenticate the firmware publisher or prevent malicious replacement. Perform OTA only on a trusted network and from a trusted server.

### 7.1 Preparation

Before starting OTA, confirm that:

- The device uses the Dual-slot partition layout and boots through the current Stage 1 Bootloader;
- There is no pending trial Slot awaiting confirmation or rollback;
- The device is connected to the network and can reach the HTTP server hosting the package;
- The HTTP server returns the correct `Content-Length`;
- The `firmware.pkg` generated in Chapter 6 has been uploaded to the HTTP server and is directly accessible at the download URL;
- The APP is compatible with the device's current Platform.

Do not reset the device, remove power, or interrupt the network during an OTA download. See Chapter 3 of [`wf88_bootloader_guide.md`](wf88_bootloader_guide.md) for Slot A/B status and rollback behavior.

For development and local-network testing, start a temporary HTTP file server from the SDK root containing `firmware.pkg`:

```cmd
python -m http.server 8000
```

If the computer uses the Python Launcher, run:

```cmd
py -3 -m http.server 8000
```

This command shares the current directory and listens on TCP port `8000`. Keep the Command Prompt window open and ensure that the computer firewall allows WF88 to access the port. If the computer IP address is `192.168.1.100`, the package URL is:

```text
http://192.168.1.100:8000/firmware.pkg
```

This temporary server is suitable only for development and local-network testing. Do not expose it directly to the Internet. Press `Ctrl+C` to stop it after testing.

### 7.2 Downloading `firmware.pkg`

Start the download with:

```text
at+wf ota_download http://<server>/<path>/firmware.pkg
```

For example:

```text
at+wf ota_download http://192.168.1.100:8000/firmware.pkg
```

An address type can be specified after the URL:

```text
at+wf ota_download http://<server>/<path>/firmware.pkg <auto|ipv4|ipv6>
```

| Parameter | Meaning |
| --- | --- |
| `auto` | Default behavior: resolve IPv4 first and try IPv6 when necessary; used when this parameter is omitted |
| `ipv4` | Use IPv4 only |
| `ipv6` | Use IPv6 only |

After the command is accepted, the key output is:

```text
OTA STARTED
OTA download requested
OTA DOWNLOADING total=<package-bytes>
```

After the download and package format, component CRC32, and Payload SHA-256 verification complete, the device prints:

```text
OTA READY downloaded=<package-bytes>
```

Only `OTA READY` means that the complete new APP has been written to the target Slot and the next step can proceed. A failed download displays:

```text
OTA FAILED downloaded=<downloaded-bytes> total=<package-bytes> failure=<code>
```

### 7.3 Inspecting the Pending Firmware

After the download completes, run:

```text
at+wf ota_info
```

The output format is:

```text
OTA INFO firmware=<version> image=<app-filename> package=<package-bytes> app=<app-bytes> components=4 target_slot=<slot>
```

The fields mean:

| Field | Meaning |
| --- | --- |
| `firmware` | `firmware_version` from the Manifest |
| `image` | `filename` of the APP component in the Manifest |
| `package` | Size of the complete `firmware.pkg` |
| `app` | Size of the APP component |
| `components` | Number of package components; the complete package generated in Chapter 6 should report `4` |
| `target_slot` | Slot to which the APP was written; `0` means Slot A and `1` means Slot B |

Before applying the update, confirm that `firmware`, `image`, file sizes, and `target_slot` are as expected. `OTA no verified firmware` means that no firmware has been downloaded and verified, so the update cannot be applied.

### 7.4 Applying the Update and Rebooting

After confirming the firmware information, run:

```text
at+wf ota_apply
```

The device prints:

```text
OTA REBOOTING
```

It then marks the target Slot as pending trial and resets immediately. After the new APP initializes successfully, that Slot becomes the confirmed Slot. If the new APP fails validation or does not complete confirmation, the Bootloader falls back to the original confirmed Slot. See Chapter 3 of [`wf88_bootloader_guide.md`](wf88_bootloader_guide.md) for instructions on checking the boot Slot, confirmation status, and rollback result.

### 7.5 Common Errors

| Output | Meaning and action |
| --- | --- |
| `OTA start failed (-1)` | Invalid URL or address-type parameter; check the command syntax |
| `OTA start failed (-2)` | Another OTA download is in progress; wait for it to finish |
| `OTA start failed (-3)` | OTA runtime resources are unavailable or the HTTP request could not start; retry later and check network status |
| `OTA start failed (-4)` | Unsupported URL protocol; the current OTA implementation uses HTTP |
| `OTA FAILED ... failure=1` | Network connection or DNS resolution failed |
| `OTA FAILED ... failure=2` | HTTP request or server response failed; check the URL, server, and `Content-Length` |
| `OTA FAILED ... failure=3` | Invalid package Header or component layout; check the Manifest and regenerate `firmware.pkg` |
| `OTA FAILED ... failure=4` | CRC32 or SHA-256 verification failed; upload `firmware.pkg` to the server again |
| `OTA FAILED ... failure=5` | Insufficient target Slot capacity or Flash write failure |
| `OTA FAILED ... failure=6` | The current boot mode, Slot Metadata, pending state, or target Slot capacity does not allow OTA; check the Bootloader and Slot status |
| `OTA FAILED ... failure=7` | Insufficient internal OTA resources or another internal error; reset and retry |
| `OTA no verified firmware` | Firmware has not been downloaded and verified successfully, or the device has reset |
| `OTA apply failed (-3)` | Slot status changed or the firmware is no longer applicable; recheck the Slot and download again |
