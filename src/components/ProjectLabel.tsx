import type { Project } from '../domain/types';
import { projectDisplayName } from '../views/projectMessages';

/** project undefined = unknown project (gray dot). */
export function ProjectLabel({ project }: { project: Project | undefined }): React.JSX.Element {
  const color = project?.color ?? 'gray';
  return (
    <span className="project-label">
      <span className={`project-dot project-color-${color}`} aria-hidden="true" />
      <span className="project-name">{projectDisplayName(project)}</span>
    </span>
  );
}
