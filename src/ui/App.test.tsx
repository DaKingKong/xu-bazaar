import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App.tsx';

describe('<App />', () => {
  it('renders the game title and the battle scene', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'xu-bazaar' })).toBeInTheDocument();
    // 战场骨架元素存在（回合信息 + 结束回合/阶段按钮）。
    expect(screen.getByText(/回合/)).toBeInTheDocument();
    expect(screen.getByLabelText('敌人仆从区')).toBeInTheDocument();
    expect(screen.getByLabelText('玩家手牌')).toBeInTheDocument();
  });
});
