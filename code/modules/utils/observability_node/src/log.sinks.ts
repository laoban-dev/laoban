import {appendFileSync, mkdirSync} from "fs";
import {dirname} from "path";
import {ModuleName} from "@laoban/observability";


export type NodeLogSink = (module: ModuleName, line: string) => void;

/**
 * Writes log lines into the provided array.
 * Useful for tests or in-memory inspection.
 */
export const memoryLogSink = (lines: string[]): NodeLogSink =>
    (_module: ModuleName, line: string) => {
        lines.push(line);
    };

/**
 * Appends log lines to a file.
 * Ensures the directory exists.
 */
export const fileLogSink = (filePath: string): NodeLogSink =>
    (_module: ModuleName, line: string) => {
        mkdirSync(dirname(filePath), {recursive: true});
        appendFileSync(filePath, `${line}\n`, "utf8");
    };

export const consoleLogSink: NodeLogSink = (_module: ModuleName, line: string) => {
    console.log(line);
}

/**
 * Combines multiple sinks into one.
 * Useful if you want to treat multiple outputs as a single sink.
 */
export const combineLogSinks = (...sinks: NodeLogSink[]): NodeLogSink =>
    (module: ModuleName, line: string) => {
        for (const sink of sinks) sink(module, line);
    };