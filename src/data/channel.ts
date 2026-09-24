export interface StoreChannelMessage {
  /** Identifies the sending store instance, so a store ignores the echo of its own write. */
  origin: string;
}

export interface StoreChannel {
  post(message: StoreChannelMessage): void;
  close(): void;
}

export type ChannelFactory = (onMessage: (message: StoreChannelMessage) => void) => StoreChannel;

export const CHANNEL_NAME = 'zeiterfassung-store';

const noopChannel: StoreChannel = { post: () => undefined, close: () => undefined };

/** For tests and for environments without BroadcastChannel. */
export const noopChannelFactory: ChannelFactory = () => noopChannel;

/** Default seam: a real BroadcastChannel where the environment has one, a no-op otherwise (jsdom). */
export const createDefaultChannel: ChannelFactory = (onMessage) => {
  const Channel = globalThis.BroadcastChannel as typeof BroadcastChannel | undefined;
  if (Channel === undefined) return noopChannel;
  const channel = new Channel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const message = event.data;
    if (
      typeof message === 'object' &&
      message !== null &&
      typeof (message as StoreChannelMessage).origin === 'string'
    ) {
      onMessage(message as StoreChannelMessage);
    }
  };
  return {
    post: (message) => channel.postMessage(message),
    close: () => channel.close(),
  };
};
