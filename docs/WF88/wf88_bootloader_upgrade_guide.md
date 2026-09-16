# WF88 Bootloader Upgrade Guide

## Applicable Scenario

This guide describes how to upgrade a device running a **legacy Bootloader** (before version 260911A) to the latest **two-stage Bootloader architecture** (Stage 0 + Stage 1) over UART. It also covers factory partition-table provisioning and installation of the complete application firmware package.

## UART Communication Settings

- **Baud Rate**: 115200
- **Data Bits**: 8
- **Stop Bits**: 1
- **Parity**: None
- **Flow Control**: None

---

## Firmware Files and Package Directory Layout

All required firmware files for the upgrade are provided under the **`artifacts/`** directory of the extracted release package (e.g., `release_<VERSION>_customer/artifacts/`):

```text
release_<VERSION>_customer/
├── artifacts/
│   ├── stage0.bin          # Stage 0 bootloader binary (transferred in Phase 1)
│   ├── stage1.bin          # Stage 1 bootloader binary (transferred in Phase 2)
│   ├── firmware.pkg        # Complete factory firmware package (transferred in Phase 4)
│   ├── WifiApp.bin         # Application binary
│   ├── WifiApp_C.bin       # Application binary packed with VPAGE header
│   ├── WifiSDK.a           # Prebuilt Wi-Fi library
│   ├── ACH.out             # ELF debug symbols
│   └── ACH.map             # Linker map file
├── project/                # IAR project files
├── source/                 # Source code tarball
├── README_RELEASE.txt      # Delivery metadata
└── ReleaseNote_<VERSION>.txt
```

### Upgrade Artifacts Checklist

| File Name | Storage Location | Used In | Purpose |
| :--- | :--- | :--- | :--- |
| **`stage0.bin`** | `artifacts/stage0.bin` | **Phase 1** | Stage 0 low-level bootloader image. Programmed into Flash sectors 0 ~ 1. |
| **`stage1.bin`** | `artifacts/stage1.bin` | **Phase 2** | Stage 1 bootloader image with dual-slot boot and recovery console. |
| **`firmware.pkg`** | `artifacts/firmware.pkg` | **Phase 4** | Complete factory firmware package containing platform binaries (`wsm`, `sdd`, `bootloader`), configuration, and application image. |

---

## Upgrade Steps and Complete UART Interaction

### Phase 1: Upgrade the Stage 0 Image (`stage0.bin`) from the Legacy Bootloader

1. Power on or reset the device. The terminal displays the legacy Bootloader main menu:

```text
ACH Flashloader 1.7.0 - 2022.11.10 (E)

Press space to repaint menu.
Press CR to go back one menu.

Main Menu
 1. Upload File
 2. Delete File
 3. Run Application
 4. Default Application
 5. Undefault Application
 6. List Files
 7. Advanced Menu
#
```

2. Enter `7` to open the maintenance menu (**Advanced Menu**):

```text
#7
Advanced Menu
 1. Update Flashloader
 2. Delete Variables
 3. Delete All Files
#
```

3. Enter `1` to select **Update Flashloader**:

```text
#1
Update Flashloader? [Y/N] 
```

4. Enter `Y` to confirm. Then start a **YMODEM transfer** in the terminal application and send `artifacts/stage0.bin` (located in the `artifacts/` folder).

5. After the transfer completes, the legacy Bootloader programs the new Stage 0 image into Flash sectors 0 ~ 1.

6. **Power-cycle or reset the device.**

---

### Phase 2: Program the Stage 1 Image (`stage1.bin`) from the New Stage 0 Recovery Menu

1. The rebooted device runs the new Stage 0. Because no valid Stage 1 image is present in Flash yet, Stage 0 automatically opens the **Stage 0 Recovery** menu:

```text
Flashloader 2.0.0 - 2026.09.03 (A)

Stage 0 Recovery
 1. Boot Stage 1
 2. Update Stage 1
 3. Update Stage 0
 4. Status
 5. Erase Stage 1
#
```

2. Enter `2` to select **Update Stage 1**:

```text
#2
Update Stage 1? (Y) 
```

3. Enter `Y` to confirm. Then start a **YMODEM transfer** in the terminal application and send `artifacts/stage1.bin` (located in the `artifacts/` folder).

4. After the transfer and verification succeed, the following message is displayed:

```text
Stage 1 updated: <size> bytes
```

5. Enter `1` (**Boot Stage 1**) to start Stage 1:

```text
#1
```

---

### Phase 3: Open the Stage 1 Console and Provision the Flash Partition Table

1. When Stage 1 starts, no factory partition table exists in sector 26. The system displays the following prompt:

```text
Stage 1 started
Partition Table invalid. Select 6 to provision the factory layout.

Stage 1 Menu
 1. Start application
 2. Update firmware package
 3. Device status
 4. Advanced maintenance
 5. Factory
 6. Provision Dual-slot layout
 0. Enter Stage 0 Recovery
#
```

2. Enter `6` to initialize the Flash partition table (**Provision Dual-slot layout**):

```text
#6
Provisioning Dual-slot partition profile...
Partition table provisioned successfully.
```

---

### Phase 4: Install the Complete Factory Firmware Package (`firmware.pkg`)

1. In the Stage 1 main menu, enter `5` to open the factory menu (**Factory Menu**):

```text
#5

Factory Menu
 1. Install factory firmware package
 2. Check all partition status
 0. Back
#
```

2. Enter `1` to select **Install factory firmware package**:

```text
#1

Factory firmware package install
WARNING: Slot A, Platform, Slot B, Config A/B, 
and Custom files will be erased. Continue? [Y/N]
```

3. Enter `Y` to confirm erasure of the required Flash partitions and prepare the device to receive the firmware package:

```text
Send package with YMODEM now
```

4. Use the terminal application to send the packaged factory firmware `artifacts/firmware.pkg` (located in the `artifacts/` folder) with **YMODEM**. When the transfer finishes, the package is automatically unpacked, verified, and installed. The following installation summary is an example of the final output:

```text
Slot A and Platform file CRC16... OK
Format Slot B... OK
Format Config A/B... skipped (package installed)
Format Custom... skipped (package installed)
Rewrite Metadata A/B; confirm Slot A... OK

OTA1 Install Summary
Mode: Factory install
Package: target=WF88M version=260908A
Size: header=708 bytes payload=794575 bytes package=795283 bytes components=8
Integrity: component CRC32 and payload SHA-256 verified
Components:
 - FILE sdd_6010.bin: 824 bytes -> Platform (replace partition)
 - FILE bootloader.bin: 2372 bytes -> Platform (replace partition)
 - FILE wsm_V3.2.3.bin: 121584 bytes -> Platform (replace partition)
 - APP WifiApp_260908A.bin: 661860 bytes -> Slot A (replace partition)
 - FILE ca.crt: 1070 bytes -> Custom (replace partition)
 - FILE client.crt: 1090 bytes -> Custom (replace partition)
 - FILE client.key: 1679 bytes -> Custom (replace partition)
 - CONFIG raw Config A image: 4096 bytes -> Config A/B (replace partition)
Target partition regions:
 Config A region: sector 29-29 addr 0x0001D000-0x0001DFFF size 4 KiB
 Config B region: sector 30-30 addr 0x0001E000-0x0001EFFF size 4 KiB
 Platform region: sector 31-70 addr 0x0001F000-0x00046FFF size 160 KiB
 Slot A region: sector 71-258 addr 0x00047000-0x00102FFF size 752 KiB
 Custom region: sector 447-511 addr 0x001BF000-0x001FFFFF size 260 KiB
Validation: Slot A and Platform CRC16 passed
Factory Platform: package content installed; CRC16 verified
Metadata: A/B initialized; Slot A confirmed
Factory cleanup: Slot B formatted
 Slot B cleanup region: sector 259-446 addr 0x00103000-0x001BEFFF size 752 KiB
Factory Config: Config A installed and verified; Config B erased
Factory Custom: package files retained
Factory package installed successfully.
```

---

### Phase 5: Start and Verify the Application

1. When factory initialization is complete, enter `0` in the Factory Menu to return to the Stage 1 main menu.

```text
Stage 1 Menu
 1. Start application
 2. Update firmware package
 3. Device status
 4. Advanced maintenance
 5. Factory
 6. Provision Dual-slot layout
 0. Enter Stage 0 Recovery
#
```

2. Enter `1` in the main menu to start the application (**Start application**):

```text
#1
Starting WifiApp from Slot A
```

3. Verify that the application starts and runs normally. On subsequent normal power-on boots, Stage 1 automatically starts the application in Slot A after the 100 ms menu-entry window:

```text
Stage 1 started
Press Enter or Del within 100 ms to enter Stage 1 Menu...
Starting WifiApp_260908A.bin from Slot A
This is my Power on! Heap=233816
```
