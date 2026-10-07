declare module 'qrcode-terminal' {
  interface QrOptions {
    small?: boolean;
  }
  const qrcodeTerminal: {
    generate(text: string, options?: QrOptions, callback?: (qr: string) => void): void;
  };
  export default qrcodeTerminal;
}
