import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectLabel } from './ProjectLabel';

describe('ProjectLabel', () => {
  it('shows name, archived suffix and color class', () => {
    const { container, unmount } = render(
      <ProjectLabel
        project={{ id: 'p', name: 'Kunde A', color: 'teal', archived: true, createdAt: 0, updatedAt: 0 }}
      />,
    );
    expect(screen.getByText('Kunde A (archiviert)')).toBeInTheDocument();
    const dot = container.querySelector('.project-dot');
    expect(dot).toHaveClass('project-color-teal');
    expect(dot).toHaveAttribute('aria-hidden', 'true');
    unmount();

    const unknown = render(<ProjectLabel project={undefined} />);
    expect(screen.getByText('Unbekanntes Projekt')).toBeInTheDocument();
    const unknownDot = unknown.container.querySelector('.project-dot');
    expect(unknownDot).toHaveClass('project-color-gray');
    expect(unknownDot).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows an active project name without suffix', () => {
    const { container } = render(
      <ProjectLabel
        project={{ id: 'p', name: 'Kunde B', color: 'blue', archived: false, createdAt: 0, updatedAt: 0 }}
      />,
    );
    expect(container.querySelector('.project-name')).toHaveTextContent(/^Kunde B$/);
    expect(container.querySelector('.project-label .project-dot')).toHaveClass('project-color-blue');
  });
});
