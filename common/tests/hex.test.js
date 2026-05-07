import { distance } from '../src/hex';
describe('hex math', () => {
    it('calculates distance correctly', () => {
        expect(distance({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1);
        expect(distance({ q: 0, r: 0 }, { q: 2, r: -2 })).toBe(2);
    });
});
