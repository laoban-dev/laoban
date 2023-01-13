import { WriteStream } from "fs";

export function closeStream(stream: WriteStream):Promise<void> {
    return new Promise((resolve, reject) => {
        stream.on("error", reject);
        stream.on("close", resolve);
        stream.end();
    });
}