import { createContext, useContext } from 'react';
import type { AuthService } from '../auth/authTypes';
import type { EntryRepository, SettingsRepository } from '../data/repository';

export interface Services {
  auth: AuthService;
  entries: EntryRepository;
  settings: SettingsRepository;
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider(props: { services: Services; children: React.ReactNode }): React.JSX.Element {
  return <ServicesContext.Provider value={props.services}>{props.children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (services === null) throw new Error('useServices must be used within ServicesProvider');
  return services;
}
