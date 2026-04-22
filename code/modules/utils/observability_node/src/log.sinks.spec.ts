import { combineLogSinks, fileLogSink, memoryLogSink } from './log.sinks';
import { existsSync, mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('memoryLogSink', () => {
    it('pushes one line into the provided array', () => {
        const lines: string[] = [];
        const sink = memoryLogSink(lines);

        sink(undefined, 'hello');

        expect(lines).toEqual(['hello']);
    });

    it('pushes multiple lines in order', () => {
        const lines: string[] = [];
        const sink = memoryLogSink(lines);

        sink(undefined, 'one');
        sink(undefined, 'two');

        expect(lines).toEqual(['one', 'two']);
    });

    it('uses the provided array instance', () => {
        const lines: string[] = ['existing'];
        const sink = memoryLogSink(lines);

        sink(undefined, 'next');

        expect(lines).toBe(lines);
        expect(lines).toEqual(['existing', 'next']);
    });
});

describe('combineLogSinks', () => {
    it('writes to all sinks', () => {
        const sink1 = jest.fn<void, [string | null | undefined, string]>();
        const sink2 = jest.fn<void, [string | null | undefined, string]>();
        const sink = combineLogSinks(sink1, sink2);

        sink(undefined, 'hello');

        expect(sink1).toHaveBeenCalledWith(undefined, 'hello');
        expect(sink2).toHaveBeenCalledWith(undefined, 'hello');
    });

    it('preserves sink call order', () => {
        const calls: string[] = [];
        const sink = combineLogSinks(
            (_module, line) => calls.push(`first:${line}`),
            (_module, line) => calls.push(`second:${line}`)
        );

        sink(undefined, 'hello');

        expect(calls).toEqual(['first:hello', 'second:hello']);
    });

    it('passes the module to all sinks', () => {
        const sink1 = jest.fn<void, [string | null | undefined, string]>();
        const sink2 = jest.fn<void, [string | null | undefined, string]>();
        const sink = combineLogSinks(sink1, sink2);

        sink('alpha', 'hello');

        expect(sink1).toHaveBeenCalledWith('alpha', 'hello');
        expect(sink2).toHaveBeenCalledWith('alpha', 'hello');
    });

    it('does not throw when there are no sinks', () => {
        const sink = combineLogSinks();

        expect(() => sink(undefined, 'hello')).not.toThrow();
    });
});

describe('fileLogSink', () => {
    it('creates parent directories and writes one line with a newline', () => {
        const dir = mkdtempSync(join(tmpdir(), 'log-sink-'));
        const filePath = join(dir, 'nested', 'app.log');

        const sink = fileLogSink(filePath);
        sink(undefined, 'hello');

        expect(existsSync(filePath)).toBe(true);
        expect(readFileSync(filePath, 'utf8')).toBe('hello\n');
    });

    it('appends multiple lines', () => {
        const dir = mkdtempSync(join(tmpdir(), 'log-sink-'));
        const filePath = join(dir, 'nested', 'app.log');

        const sink = fileLogSink(filePath);
        sink(undefined, 'one');
        sink(undefined, 'two');

        expect(readFileSync(filePath, 'utf8')).toBe('one\ntwo\n');
    });
});