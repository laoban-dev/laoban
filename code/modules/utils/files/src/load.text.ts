import {ErrorsOr, errors} from "@laoban/errors";
import {
    defaultLoadTextConfig,
    FileOpIssue,
    FileOpIssueKind, LoadFileFn,
    LoadTextConfig, LoadTextDefaults,
    LoadTextSource,
    makeFileOpIssue,
} from "./fileops";

const isHttpUrl = (source: string): boolean =>
    source.startsWith("http://") || source.startsWith("https://");

const makeIssue = (
    kind: FileOpIssueKind,
    message: string,
    context: FileOpIssue["context"],
    cause?: unknown,
    code?: string,
): FileOpIssue => makeFileOpIssue(kind, message, context, cause, code);

export const loadFromMarker = (defaults: LoadTextDefaults) => async (
    source: LoadTextSource,
    config: LoadTextConfig,
): Promise<ErrorsOr<string, FileOpIssue>> => {
    const fullConfig = defaultLoadTextConfig(defaults, config,);
    const {markers} = fullConfig;

    for (const [marker, replacement] of Object.entries(markers)) {
        if (source.startsWith(marker)) {
            const resolvedSource = `${replacement}${source.slice(marker.length)}`;
            return loadText(defaults)(resolvedSource, fullConfig);
        }
    }

    return errors(
        makeIssue(
            "unknownMarker",
            `Unknown marker in source [${source}]`,
            {
                operation: "load",
                filename: source,
            },
        ),
    );
};

export const loadText = (defaults: LoadTextDefaults): LoadFileFn => async (
    source: LoadTextSource,
    config?: LoadTextConfig,
): Promise<ErrorsOr<string, FileOpIssue>> => {
    const fullConfig = defaultLoadTextConfig(defaults, config,);
    const {loadFile, loadUrl} = fullConfig.infrastructure;

    if (isHttpUrl(source)) return loadUrl(source, fullConfig);
    if (source.startsWith("@")) return loadFromMarker(defaults)(source, fullConfig);
    return loadFile(source, fullConfig);
};