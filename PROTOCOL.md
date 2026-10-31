# OnePlus Buds 4 control link

OpenBuds talks to the OnePlus Buds 4, model id `065414`. Protocol details come from QuickBuds' published captures and probes of the author's own earbuds. Each fact below cites its source. Facts with no saved capture behind them are marked `TODO: re-verify with a capture`.

Sources:

- **QuickBuds**: [spizganed/QuickBuds](https://github.com/spizganed/QuickBuds) at commit `8e8d3e9`. Cited as `QuickBuds docs/PROTOCOL.md section N`. QuickBuds labels each claim `[CAPTURE]` (seen on real earbuds) or `[VENDOR]` (taken from the vendor app). Only `[CAPTURE]` claims are cited as fact here. The command bitmap, which QuickBuds labels `[VENDOR]`, is marked TODO.
- **Own probe**: a CoreBluetooth probe of the author's own Buds 4 on 2026-10-30. Its output was not saved, so facts from it are also marked TODO.

## Links

- **Web app.** Uses Web Serial on the classic Bluetooth RFCOMM link after macOS has paired the buds (`app/src/lib/session.ts:195`). Chrome only (`app/src/lib/serial.d.ts:1`). The RFCOMM channel the web route opens is `TODO: re-verify with a capture`. QuickBuds' Android code opens RFCOMM channel 15 (QuickBuds `docs/PROTOCOL.md` section 1).
- **Mac app.** Uses GATT through CoreBluetooth. Whether the buds expose the control characteristics to this path is `TODO: re-verify with a capture`.
- **One control client.** The app notes that the RFCOMM link takes one control client per computer (`app/src/lib/store.ts:22`). Whether a second client can share the link is `TODO: re-verify with a capture`.

## Service and transport

Service UUID: `0000079A-D102-11E1-9B23-00025B00A5A5`.

- The link is classic Bluetooth RFCOMM/SPP, not BLE (QuickBuds `docs/PROTOCOL.md` section 1).
- QuickBuds tries this UUID first and reports that it connects on the Buds 4 (QuickBuds `docs/PROTOCOL.md` section 1).

## GATT characteristics

The Mac path uses two characteristics under the same service base UUID:

| Role | UUID | Source |
|---|---|---|
| Write | `0100079A-D102-11E1-9B23-00025B00A5A5` | Author's own CoreBluetooth probe on Buds 4, 2026-10-30 (output not saved) |
| Notify | `0200079A-D102-11E1-9B23-00025B00A5A5` | Author's own CoreBluetooth probe on Buds 4, 2026-10-30 (output not saved) |

- Whether the buds expose these two characteristics is `TODO: re-verify with a capture`.
- The characteristic properties are `TODO: re-verify with a capture`.
- That replies arrive on the notify characteristic is `TODO: re-verify with a capture`.
- The maximum write-without-response length reported by CoreBluetooth is `TODO: re-verify with a capture`.

## Query example

The `0x0100` handshake with an empty payload, sequence 1, is:

```
AA 07 00 00 00 01 01 00 00
```

QuickBuds lists these bytes as a `[CAPTURE]` example (QuickBuds `docs/PROTOCOL.md` section 2). The buds' reply to this write over GATT is `TODO: re-verify with a capture`.

## Frame format

```
AA  <TotalLen>  00  00  <Cmd, 2 bytes LE>  <Seq>  <PayLen, 2 bytes LE>  <Payload>
```

From QuickBuds `docs/PROTOCOL.md` section 2 (`[CAPTURE]`):

- `TotalLen` is LEB128: seven bits per byte, low bits first, high bit set while more bytes follow. It counts every byte after itself.
- For a whole message, `TotalLen = 7 + payload length`.
- Example: a 124-byte payload gives `TotalLen` 131, sent as `AA 83 01`.
- There is no checksum.

## Replies and sequence numbers

From QuickBuds `docs/PROTOCOL.md` section 3 (`[CAPTURE]`):

- The sender picks `Seq`, and the reply echoes it.
- A reply's command is the request command with bit 15 set.
- A write reply carries a status byte. `00` means the buds accepted the write.
- Acceptance does not confirm the setting took effect, so OpenBuds reads the state back after a write.

## Command bitmap

The handshake reply `0x8100` carries a bitmap of supported commands. The table that maps each bit to a command is `BIT_COMMANDS` in QuickBuds `desktop/src/types.rs` at commit `8e8d3e9` (line 205). The app references the same bitmap at `app/src/lib/protocol.ts:331`. QuickBuds labels this bitmap `[VENDOR]` (QuickBuds `docs/PROTOCOL.md` line 265), not `[CAPTURE]`, so the whole table is `TODO: re-verify with a capture`.

## Model lookup

- Product id bytes `00 14 54 06` map to model `065414` (QuickBuds `docs/PROTOCOL.md` section 21.1, `[CAPTURE]`).

## Implementations

- Swift: [native/Sources/BudsKit](native/Sources/BudsKit)
- TypeScript: [app/src/lib/protocol.ts](app/src/lib/protocol.ts)

## Firmware

The app notes name firmware `138.138.105` as the build used for testing. No saved capture or device readout in the repo confirms it. `TODO: re-verify with a capture`.

## Credit and license

The command bitmap comes from QuickBuds, which is GPL-3.0-or-later (QuickBuds `desktop/Cargo.toml` and `README.md`). That is why OpenBuds is GPL-3.0-or-later too (`NOTICE`).
