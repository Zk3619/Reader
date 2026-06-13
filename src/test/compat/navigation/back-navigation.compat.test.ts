import { describe, expect, it, beforeEach } from 'vitest';
import {
  __resetBackNavigationForTests,
  consumeBackNavigation,
  markBackNavigationPreservedHistory,
  registerBackHandler,
  stepRootExitConfirm,
  takeLayerClosedViaBackNavigation,
  triggerBackNavigation,
  wasLastBackNavigationHistoryPreserved,
} from '@/lib/navigation/back-navigation';

describe('back-navigation', () => {
  beforeEach(() => {
    __resetBackNavigationForTests();
  });

  it('consumeBackNavigation 按栈顶优先消费', () => {
    const order: string[] = [];
    registerBackHandler(() => {
      order.push('a');
      return true;
    });
    registerBackHandler(() => {
      order.push('b');
      return true;
    });
    consumeBackNavigation();
    expect(order).toEqual(['b']);
  });

  it('triggerBackNavigation 在无 handler 时返回 false', () => {
    expect(triggerBackNavigation()).toBe(false);
  });

  it('consumeBackNavigation 标记系统返回已关层，供 history 同步去重', () => {
    registerBackHandler(() => true);
    expect(takeLayerClosedViaBackNavigation()).toBe(false);
    consumeBackNavigation();
    expect(takeLayerClosedViaBackNavigation()).toBe(true);
    expect(takeLayerClosedViaBackNavigation()).toBe(false);
  });

  it('preserved history does not mark layer closed', () => {
    registerBackHandler(() => {
      markBackNavigationPreservedHistory();
      return true;
    });
    consumeBackNavigation();
    expect(wasLastBackNavigationHistoryPreserved()).toBe(true);
    expect(takeLayerClosedViaBackNavigation()).toBe(false);
  });

  it('stepRootExitConfirm 首次 armed、窗口内再次 exit', () => {
    const t0 = 1000;
    const first = stepRootExitConfirm(t0, 0);
    expect(first.action).toBe('armed');
    expect(first.nextArmedAt).toBe(t0);

    const second = stepRootExitConfirm(t0 + 500, first.nextArmedAt);
    expect(second.action).toBe('exit');

    const expired = stepRootExitConfirm(t0 + 3000, first.nextArmedAt);
    expect(expired.action).toBe('armed');
  });
});
