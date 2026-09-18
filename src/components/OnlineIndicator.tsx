import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OnlineIndicator(): React.JSX.Element {
  const online = useOnlineStatus();
  return (
    <span role="status" className="online-indicator" data-online={online ? 'true' : 'false'}>
      {online ? 'Online' : 'Offline'}
    </span>
  );
}
