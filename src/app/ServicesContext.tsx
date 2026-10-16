import { createContext, useContext } from 'react';
import type { AuthService } from '../auth/authTypes';
import type { EntryRepository, ProjectRepository, SettingsRepository } from '../data/repository';

export interface Services {
  auth: AuthService;
  entries: EntryRepository;
  settings: SettingsRepository;
  /** Always set in production (src/firebase/app.ts). Optional only so slice-1/2 test fixtures compile unchanged. */
  projects?: ProjectRepository;
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
