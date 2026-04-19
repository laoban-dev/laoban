import { safeString } from './safe.string';

describe('safeString', () => {
    it('returns "undefined" for undefined', () => {
        expect(safeString(undefined)).toBe('undefined');
    });

    it('returns "null" for null', () => {
        expect(safeString(null)).toBe('null');
    });

    it('returns strings unchanged', () => {
        expect(safeString('hello')).toBe('hello');
        expect(safeString('')).toBe('');
    });

    it('converts numbers to strings', () => {
        expect(safeString(0)).toBe('0');
        expect(safeString(42)).toBe('42');
        expect(safeString(-3.14)).toBe('-3.14');
        expect(safeString(NaN)).toBe('NaN');
        expect(safeString(Infinity)).toBe('Infinity');
    });

    it('converts booleans to strings', () => {
        expect(safeString(true)).toBe('true');
        expect(safeString(false)).toBe('false');
    });

    it('converts bigint to string', () => {
        const big = BigInt(123);

        expect(safeString(big)).toBe('123');
    });

    it('uses stack for Error when stack is present', () => {
        const err = new Error('boom');
        err.stack = 'STACK_TRACE';

        expect(safeString(err)).toBe('STACK_TRACE');
    });

    it('falls back to message for Error when stack is missing', () => {
        const err = new Error('boom');
        err.stack = undefined;

        expect(safeString(err)).toBe('boom');
    });

    it('stringifies plain objects as json', () => {
        expect(safeString({ a: 1, b: 'two' })).toBe('{"a":1,"b":"two"}');
    });

    it('stringifies arrays as json', () => {
        expect(safeString([1, 'two', false])).toBe('[1,"two",false]');
    });

    it('returns <unstringifiable> for circular objects', () => {
        const obj: Record<string, unknown> = {};
        obj.self = obj;

        expect(safeString(obj)).toBe('<unstringifiable>');
    });

    it('stringifies Date using json serialization', () => {
        const date = new Date('2024-01-02T03:04:05.000Z');

        expect(safeString(date)).toBe('"2024-01-02T03:04:05.000Z"');
    });
});