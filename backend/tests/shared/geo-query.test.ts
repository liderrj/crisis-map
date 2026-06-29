// @ts-nocheck
import { parseFilters } from '../../shared/geo-query';

describe('shared/geo-query — sandbox source routing', () => {
  test('parseFilters extracts source=partner:<id>', () => {
    const f = parseFilters({ source: 'partner:bomberos-caracas' });
    expect(f.source).toBe('partner:bomberos-caracas');
  });

  test('parseFilters accepts all sandbox-relevant filters together', () => {
    const f = parseFilters({
      source: 'partner:bomberos-caracas',
      since: '1719500000',
      until: '1719600000',
      status: 'active,resolved',
      limit: '50',
    });
    expect(f.source).toBe('partner:bomberos-caracas');
    expect(f.since).toBe(1719500000);
    expect(f.until).toBe(1719600000);
    expect(f.statuses).toEqual(['active', 'resolved']);
    expect(f.limit).toBe(50);
  });

  test('parseFilters validates the bbox even when source is set (source requires partnerSource route)', () => {
    // With source set, the handler routes to listByPartner which does
    // not use bbox. parseFilters should still parse bbox without
    // erroring so that callers passing both (e.g. a UI that combines
    // them) don't trip on validation.
    const f = parseFilters({ source: 'partner:foo', bbox: '-67.20,10.20,-66.40,10.80' });
    expect(f.bbox).toBe('-67.20,10.20,-66.40,10.80');
  });

  test('parseFilters defaults status to [active] when missing', () => {
    const f = parseFilters({});
    expect(f.statuses).toEqual(['active']);
  });
});
