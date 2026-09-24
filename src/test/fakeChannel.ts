import type { ChannelFactory, StoreChannel, StoreChannelMessage } from '../data/channel';

export interface FakeChannelHub {
  /** Pass to createLocalStore / createTestStore. Every channel receives what the others post. */
  factory: ChannelFactory;
  /** Number of channels that have not been closed. */
  openCount(): number;
}

/** Models BroadcastChannel across two stores: a message reaches every other open channel, never the
 *  poster itself. Delivery is synchronous; the receiving store's reload stays asynchronous. */
export function createFakeChannelHub(): FakeChannelHub {
  const listeners = new Map<StoreChannel, (message: StoreChannelMessage) => void>();
  const factory: ChannelFactory = (onMessage) => {
    const channel: StoreChannel = {
      post: (message) => {
        for (const [other, listener] of listeners) {
          if (other !== channel) listener(message);
        }
      },
      close: () => {
        listeners.delete(channel);
      },
    };
    listeners.set(channel, onMessage);
    return channel;
  };
  return { factory, openCount: () => listeners.size };
}
