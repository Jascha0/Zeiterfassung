import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHANNEL_NAME, createDefaultChannel } from './channel';

class StubBroadcastChannel {
  static readonly instances: StubBroadcastChannel[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  readonly posted: unknown[] = [];
  closed = false;

  constructor(readonly name: string) {
    StubBroadcastChannel.instances.push(this);
  }

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  close(): void {
    this.closed = true;
  }
}

function installStub(): void {
  vi.stubGlobal('BroadcastChannel', StubBroadcastChannel);
}

afterEach(() => {
  vi.unstubAllGlobals();
  StubBroadcastChannel.instances.length = 0;
});

describe('createDefaultChannel without BroadcastChannel', () => {
  it('returns a channel whose post and close do nothing and never calls back', () => {
    // jsdom 30 does provide BroadcastChannel, so the absent case is reached by stubbing it away.
    vi.stubGlobal('BroadcastChannel', undefined);
    const onMessage = vi.fn();
    const channel = createDefaultChannel(onMessage);

    expect(() => channel.post({ origin: 'x' })).not.toThrow();
    expect(() => channel.close()).not.toThrow();
    expect(onMessage).not.toHaveBeenCalled();
  });
});

describe('createDefaultChannel with a BroadcastChannel', () => {
  it('opens the channel under CHANNEL_NAME', () => {
    installStub();
    createDefaultChannel(vi.fn());

    expect(StubBroadcastChannel.instances).toHaveLength(1);
    expect(StubBroadcastChannel.instances[0].name).toBe(CHANNEL_NAME);
  });

  it('forwards post to postMessage', () => {
    installStub();
    const channel = createDefaultChannel(vi.fn());
    channel.post({ origin: 'store-1' });

    expect(StubBroadcastChannel.instances[0].posted).toEqual([{ origin: 'store-1' }]);
  });

  it('passes an incoming message with an origin to the callback', () => {
    installStub();
    const onMessage = vi.fn();
    createDefaultChannel(onMessage);
    const underlying = StubBroadcastChannel.instances[0];
    underlying.onmessage?.({ data: { origin: 'x' } } as MessageEvent<unknown>);

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({ origin: 'x' });
  });

  it('ignores an incoming message whose payload is not an object with an origin', () => {
    installStub();
    const onMessage = vi.fn();
    createDefaultChannel(onMessage);
    const underlying = StubBroadcastChannel.instances[0];
    underlying.onmessage?.({ data: 'reload' } as MessageEvent<unknown>);
    underlying.onmessage?.({ data: null } as MessageEvent<unknown>);
    underlying.onmessage?.({ data: { origin: 7 } } as MessageEvent<unknown>);

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('closes the underlying channel', () => {
    installStub();
    const channel = createDefaultChannel(vi.fn());
    channel.close();

    expect(StubBroadcastChannel.instances[0].closed).toBe(true);
  });
});
