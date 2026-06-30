import {
  shouldResolve,
  tallyVotes,
  RESOLVE_THRESHOLD_CONFIRMATIONS,
  RESOLVE_THRESHOLD_DISTINCT_DEVICES,
} from '../../shared/confirmation-threshold';

const makeRow = (deviceId: string, action: string) => ({ deviceId, action });

describe('shared/confirmation-threshold', () => {
  test('returns false on empty list', () => {
    expect(shouldResolve([])).toBe(false);
  });

  test('a single no_longer_exists vote is not enough', () => {
    expect(shouldResolve([makeRow('d1', 'no_longer_exists')])).toBe(false);
  });

  test('two distinct devices with two votes is not enough', () => {
    const rows = [makeRow('d1', 'no_longer_exists'), makeRow('d2', 'confirm')];
    expect(shouldResolve(rows)).toBe(false);
  });

  test('three votes from one device alone is not enough (distinct gate)', () => {
    const rows = [
      makeRow('d1', 'no_longer_exists'),
      makeRow('d1', 'confirm'),
      makeRow('d1', 'confirm'),
    ];
    expect(shouldResolve(rows)).toBe(false);
  });

  test('three worsening votes from three devices alone is not enough (affirming gate)', () => {
    // Worsening does not affirm that the incident exists; only that
    // it's getting worse. So three distinct worsen votes do not flip.
    const rows = [
      makeRow('d1', 'worsened'),
      makeRow('d2', 'worsened'),
      makeRow('d3', 'worsened'),
    ];
    expect(shouldResolve(rows)).toBe(false);
  });

  test('worsened votes DO count toward the distinct-devices gate', () => {
    // Two worsening from two devices + one affirming from a third →
    // affirming=1 (<3) but distinct=3 (>=2). Still under threshold
    // because the affirming count is too low.
    const rows = [
      makeRow('d1', 'worsened'),
      makeRow('d2', 'worsened'),
      makeRow('d3', 'confirm'),
    ];
    expect(shouldResolve(rows)).toBe(false);
  });

  test('three votes from two distinct devices resolves', () => {
    const rows = [
      makeRow('d1', 'no_longer_exists'),
      makeRow('d2', 'confirm'),
      makeRow('d3', 'confirm'),
    ];
    expect(shouldResolve(rows)).toBe(true);
  });

  test('two confirm votes from two devices plus a worsened is still under threshold', () => {
    // worsened does NOT count toward affirming tally.
    const rows = [
      makeRow('d1', 'confirm'),
      makeRow('d2', 'confirm'),
      makeRow('d3', 'worsened'),
    ];
    expect(shouldResolve(rows)).toBe(false);
  });

  test('three confirm votes from two devices plus any number of worsened still resolves', () => {
    const rows = [
      makeRow('d1', 'confirm'),
      makeRow('d2', 'confirm'),
      makeRow('d3', 'confirm'),
      makeRow('d1', 'worsened'),
      makeRow('d2', 'worsened'),
    ];
    expect(shouldResolve(rows)).toBe(true);
  });

  test('improved counts as affirming', () => {
    const rows = [
      makeRow('d1', 'improved'),
      makeRow('d2', 'improved'),
      makeRow('d3', 'improved'),
    ];
    expect(shouldResolve(rows)).toBe(true);
  });

  test('threshold constants match the documented values', () => {
    expect(RESOLVE_THRESHOLD_CONFIRMATIONS).toBe(3);
    expect(RESOLVE_THRESHOLD_DISTINCT_DEVICES).toBe(2);
  });

  describe('tallyVotes', () => {
    test('separates affirming and worsening counts', () => {
      const rows = [
        makeRow('d1', 'confirm'),
        makeRow('d1', 'worsened'),
        makeRow('d2', 'confirm'),
        makeRow('d3', 'improved'),
        makeRow('d4', 'worsened'),
      ];
      const t = tallyVotes(rows);
      expect(t.affirming).toBe(3);
      expect(t.worsening).toBe(2);
      expect(t.distinctDevices).toBe(4);
    });

    test('empty input is zero', () => {
      const t = tallyVotes([]);
      expect(t).toEqual({ affirming: 0, worsening: 0, distinctDevices: 0 });
    });
  });
});