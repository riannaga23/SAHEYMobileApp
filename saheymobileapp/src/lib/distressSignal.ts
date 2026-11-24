export type ConfirmedDistressSignal = { deviceId: string; receivedAt: number };

export function isConfirmedDistress(text: string): boolean {
  return text.replace(/[\s_-]+/g, '').toUpperCase() === 'CONFIRMEDDISTRESS';
}
