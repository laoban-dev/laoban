import {appendFileSync, mkdirSync} from "fs";
import {dirname} from "path";

export type NodeLogSink = (line: string) => void;

/**
 * Writes log lines into the provided array.
 * Useful for tests or in-memory inspection.
 */
export const memoryLogSink = (lines: string[]): NodeLogSink =>
    (line: string) => {
        lines.push(line);
    };

/**
 * Appends log lines to a file.
 * Ensures the directory exists.
 */
export const fileLogSink = (filePath: string): NodeLogSink =>
    (line: string) => {
        mkdirSync(dirname(filePath), {recursive: true});
        appendFileSync(filePath, `${line}\n`, "utf8");
    };

export const consoleLogSink: NodeLogSink = (line: string) => {
    console.log(line);
}

/**
 * Combines multiple sinks into one.
 * Useful if you want to treat multiple outputs as a single sink.
 */
export const combineLogSinks = (...sinks: NodeLogSink[]): NodeLogSink =>
    (line: string) => {
        for (const sink of sinks) sink(line);
    };