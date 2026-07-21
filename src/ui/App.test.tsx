import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App.tsx';

describe('<App />', () => {
  it('renders the game title and an empty demo board', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'xu-bazaar' })).toBeInTheDocument();
    expect(screen.getByText(/仆从区为空/)).toBeInTheDocument();
  });
});
