// Minimal Web Serial types for the Bluetooth RFCOMM route this app uses (Chrome only).
interface SerialPortInfo {
  bluetoothServiceClassId?: string;
}
interface SerialPort {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
}
interface SerialPortRequestOptions {
  allowedBluetoothServiceClassIds?: string[];
  filters?: { bluetoothServiceClassId?: string }[];
}
interface Serial extends EventTarget {
  getPorts(): Promise<SerialPort[]>;
  requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
}
interface Navigator {
  readonly serial?: Serial;
}
