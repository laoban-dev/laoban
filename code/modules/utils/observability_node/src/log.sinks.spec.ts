import { combineLogSinks, fileLogSink, memoryLogSink } from './log.sinks';
import { existsSync, mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('memoryLogSink', () => {
    it('pushes one line into the provided array', () => {
        const lines: string[] = [];
        const sink = memoryLogSink(lines);

        sink('hello');

        expect(lines).toEqual(['hello']);
    });

    it('pushes multiple lines in order', () => {
        const lines: string[] = [];
        const sink = memoryLogSink(lines);

        sink('one');
        sink('two');

        expect(lines).toEqual(['one', 'two']);
    });

    it('uses the provided array instance', () => {
        const lines: string[] = ['existing'];
        const sink = memoryLogSink(lines);

        sink('next');

        expect(lines).toBe(lines);
        expect(lines).toEqual(['existing', 'next']);
    });
});

describe('combineLogSinks', () => {
    it('writes to all sinks', () => {
        const sink1 = jest.fn<void, [string]>();
        const sink2 = jest.fn<void, [string]>();
        const sink = combineLogSinks(sink1, sink2);

        sink('hello');

        expect(sink1).toHaveBeenCalledWith('hello');
        expect(sink2).toHaveBeenCalledWith('hello');
    });

    it('preserves sink call order', () => {
        const calls: string[] = [];
        const sink = combineLogSinks(
            line => calls.push(`first:${line}`),
            line => calls.push(`second:${line}`)
        );

        sink('hello');

        expect(calls).toEqual(['first:hello', 'second:hello']);
    });

    it('does not throw when there are no sinks', () => {
        const sink = combineLogSinks();

        expect(() => sink('hello')).not.toThrow();
    });
});

describe('fileLogSink', () => {
    it('creates parent directories and writes one line with a newline', () => {
        const dir = mkdtempSync(join(tmpdir(), 'log-sink-'));
        const filePath = join(dir, 'nested', 'app.log');

        const sink = fileLogSink(filePath);
        sink('hello');

        expect(existsSync(filePath)).toBe(true);
        expect(readFileSync(filePath, 'utf8')).toBe('hello\n');
    });

    it('appends multiple lines', () => {
        const dir = mkdtempSync(join(tmpdir(), 'log-sink-'));
        const filePath = join(dir, 'nested', 'app.log');

        const sink = fileLogSink(filePath);
        sink('one');
        sink('two');

        expect(readFileSync(filePath, 'utf8')).toBe('one\ntwo\n');
    });
});