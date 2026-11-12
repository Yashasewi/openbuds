# OnePlus earbuds control link

OpenBuds talks to the OnePlus Buds 4 (model id `065414`) and, experimentally, the OnePlus Buds 3 (`063C14`). Protocol details come from QuickBuds' published captures, probes of the author's own earbuds, and one owner capture of a Buds 3. Each fact below cites its source. Facts with no saved capture behind them are marked `TODO: re-verify with a capture`. Where two models differ, see [Per-model differences](#per-model-differences).

Sources:

- **QuickBuds**: [spizganed/QuickBuds](https://github.com/spizganed/QuickBuds) at commit `8e8d3e9`. Cited as `QuickBuds docs/PROTOCOL.md section N`. QuickBuds labels each claim `[CAPTURE]` (seen on real earbuds) or `[VENDOR]` (taken from the vendor app). Only `[CAPTURE]` claims are cited as fact here. The command bitmap, which QuickBuds labels `[VENDOR]`, is marked TODO.
- **Own probe**: a CoreBluetooth probe of the author's own Buds 4 on 2026-10-30. Its output was not saved, so facts from it are also marked TODO.
- **Owner capture, OnePlus Buds 3 fw 127.127.101, 2026-10-12**: the RFCOMM packet log of a hardware feature test on the owner's own Buds 3 (macOS 15.7.3, RFCOMM channel 15 found through SDP record `0000079A`), by Himanshu Singh, author of OneBuds. Its 49 request frames are replayed in `app/tests/fixtures/buds3-captured-tx.json`. Replies quoted below are from that log. The log's one `0x0204` push that carried other devices' names and addresses is not used.

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
- Product id bytes `00 14 3C 06` map to model `063C14`, OnePlus Buds 3 (owner capture, OnePlus Buds 3 fw 127.127.101, 2026-10-12).
- Any other id has no profile. OpenBuds then sends nothing but identity reads (`0x0100`, `0x0103`, `0x0105`, `0x0200`, and `0x010D` for switch ids 6, 4 and 17) and shows a read-only "Unsupported model" state with a **Copy diagnostics** button. The report holds the product id, firmware, the `0x8100` bitmap, the `0x8200` offered events and the `0x010D` reply, and nothing else.

## Requests from the buds

The buds can ask for the time with `0x0500`. The answer is `0x8500` with payload `00 <unix seconds u32 LE>`, echoing the request's sequence number (QuickBuds `docs/PROTOCOL.md` line 483, `[CAPTURE]`). QuickBuds reports that a Nord Buds 3 Pro resets the link 3 to 5 seconds after connecting if this goes unanswered (lines 474-477, `[CAPTURE]`). Both apps answer on every model, including one with no profile. Sequence 0 and 255 are allowed for this one reply only. The owner's Buds 3 capture contains no `0x0500`.

## Per-model differences

Each model has a profile (`ModelProfile` in `app/src/lib/protocol.ts`, `native/Sources/BudsKit/Profile.swift`). A profile lists the commands and payload shapes that model may be sent; everything else is refused before it is encoded. At run time the list is also cut down to what the `0x8100` bitmap offers. The two tables are checked against one fixture (`app/tests/fixtures/profiles.json`), and the same recorded frames are replayed through both clients.

| | OnePlus Buds 4 (`065414`) | OnePlus Buds 3 (`063C14`), experimental |
|---|---|---|
| Tested firmware | 138.138.105 (`TODO: re-verify with a capture`) | 127.127.101 (owner capture, 2026-10-12) |
| Noise SET bits (`0x0404 01 01 <1<<bit>`) | Off 0, ANC 1, Transparency 2, Deep 4, Medium 5, Light 6, Smart 7, Adaptive 11 (QuickBuds line 990, `[CAPTURE]`) | Off 0, ANC 1, Transparency 2, Deep 4, Medium 5, Light 6, Smart 7. Each acknowledged `00` and read back through `0x010C 01 01` as Off `0x0008`, Transparency `0x0100`, ANC and Smart `0x0080`, Deep `0x0010`, Medium `0x0020`, Light `0x0040`. Adaptive (bit 11) was never tried, so it is hidden |
| Smart level (`0x010C 04 01`) | read | read allowed but never queried in the capture. A push `0x0204 03 04 01 40 00` was seen after selecting ANC. Unverified |
| Hold cycle (`0x010C 02 01`, `0x0404 02 01 <mask>`) | supported | not captured, so not read, written or shown |
| Switches (`0x010D` read, `0x0403` write) | ids 4, 6, 11, 17, 24, 27, 28, 29 | read ids 6 game mode, 4 wear detection, 17 dual connection (reply `00 03 06 00 04 01 11 01`). Written and read back: 6 and 4. 17 was not written because it could drop the link, so it is shown read-only. No other id is sent |
| Read request for `0x010D` | web app asks for ids 5, 4, 11, 17, 24, 6, 27, 29, 28; the Mac app also asks for id 9 (unchanged from before profiles) | ids 6, 4, 17 (`03 06 04 11`) |
| EQ presets (`0x0406`, read `0x010F`) | ids 0 to 2 Balanced, Serenade, Bass; custom ids from 4 (QuickBuds line 1044, `[CAPTURE]`) | ids 0 to 3 each acknowledged and read back; push `0x0504 <id>` seen. Labels are neutral ("Preset 1" to "Preset 4") because the owner has not yet confirmed the names from the phone app. Custom EQ (`0x0122`, `0x0418`) was not captured and is excluded |
| Gesture table (`0x0108`) | whole-table write | 12 entries: devices 1 and 2, button 1, action 1 to 4, 6 and 5. No call group (button 6). Write captured as the single slot `0x0401 01 01 01 02 03` (left double tap to voice assistant), acknowledged and read back, then restored. OpenBuds writes only the changed slot for this model. Menus are Buds 4's minus function 17 (game mode), which the capture did not show |
| Offered events (`0x8200`) | QuickBuds line 269, `[CAPTURE]` | `00 09 01 02 03 04 08 0B F1 F2 F3`. OpenBuds subscribes to 1, 2 and 3 only (the capture subscribed to `06 01 02 03 04 08 0B`; event `0B` is not in OpenBuds' validator) |
| Capability bitmap (`0x8100`) | QuickBuds, `[VENDOR]` | `00 FF 77 5A EE E7 0E 22 00` |
| Product id and firmware | `00 14 54 06` | `0x8103` `00 14 3C 06`; `0x8105` text `1,1,01,1,2,127,2,1,01,2,2,127,3,2,101` |
| Battery (`0x0106`) and wear push (`0x0204 02`) | as documented | same layouts. `0x0109` was never queried, so wear arrives by push only |
| Tools (find, fit test, hearing test), BassWave, Hi-Res, 3D audio, Golden Sound, prompt volume, codec, connected devices | supported | not captured, not sent, hidden |
| Transport | RFCOMM (web), GATT (Mac) | RFCOMM channel 15 through SDP `0000079A` is what the capture used. The Mac app uses GATT. The owner saw GATT service `0000079A` with characteristics `0100079A` (write, write without response) and `0200079A` (read, notify) on the Buds 3, read-only, but no OPO frames were ever exchanged over GATT on this model. The Mac app's GATT path for Buds 3 is therefore **unverified**; the web app's RFCOMM path matches the capture |

### Sources and licences

| Source | Licence | Used for |
|---|---|---|
| Owner capture, OnePlus Buds 3 fw 127.127.101, 2026-10-12 (Himanshu Singh) | The owner's own data, contributed here under GPL-3.0-or-later | Every Buds 3 fact above. Facts only; no code from [OneBuds](https://github.com/himanshudev28/OneBuds), which has no licence |
| [QuickBuds](https://github.com/spizganed/QuickBuds) (spizganed) | GPL-3.0-or-later | Buds 4 facts and the command bitmap, `[CAPTURE]` lines only |
| [OppoPodsManager-linux](https://github.com/Osilvfe/OppoPodsManager-linux) and `oplus-buds3-bridge.rs` in [Osilvfe/dots-hyprland](https://github.com/Osilvfe/dots-hyprland) | Fork without a LICENSE file (upstream GPL-3.0-or-later); GPL-3.0 | Reference for the Buds 3 command layout only. No value in OpenBuds comes from it |
| [OPPO-Pods-for-macOS](https://github.com/ssigpoy/OPPO-Pods-for-macOS) (ssigpoy) | GPL-3.0 | Reference only. Nothing copied |
| [BudsDesk](https://github.com/shashank99928/BudsDesk) (shashank99928) | MIT | Reference for the "no write path until measured" policy |
| Pratyaksh ([@pratyakshmm](https://x.com/pratyakshmm)) | No public repository found | Showed that Buds 3 control on macOS is possible. Nothing used |

No string, model list or asset from HeyMelody or any other vendor app is used (see the clean-room rule in [CONTRIBUTING.md](CONTRIBUTING.md)).

## Implementations

- Swift: [native/Sources/BudsKit](native/Sources/BudsKit)
- TypeScript: [app/src/lib/protocol.ts](app/src/lib/protocol.ts)
- Tests: `pnpm test` in `app/` (golden frames, profile table, a fake-device session); `swift test` in `native/` replays the same fixtures through the Swift code

## Firmware

The app notes name firmware `138.138.105` as the build used for testing on Buds 4. No saved capture or device readout in the repo confirms it. `TODO: re-verify with a capture`. The Buds 3 firmware `127.127.101` is from the owner capture (`0x8105`).

## Credit and license

The command bitmap comes from QuickBuds, which is GPL-3.0-or-later (QuickBuds `desktop/Cargo.toml` and `README.md`). That is why OpenBuds is GPL-3.0-or-later too (`NOTICE`).
