import { value } from "@laoban/errors";
import type { TemplateFns } from "./template.types";
import { getLastSegment } from "@laoban/strings";

export const defaultTemplateFns = <T>(): TemplateFns<T> => ({
    urlEncode: ({ value: v }) =>
        value(encodeURIComponent(String(v))),

    lastSegment: ({ value: v }) =>
        value(getLastSegment(String(v))),

    forwardSlashToDot: ({ value: v }) =>
        value(String(v).replace(/\//g, ".")),

    toLowerCase: ({ value: v }) =>
        value(String(v).toLowerCase()),

    toUpperCase: ({ value: v }) =>
        value(String(v).toUpperCase()),

    toTitleCase: ({ value: v }) =>
        value(
            String(v).replace(/\w\S*/g, txt =>
                txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
            )
        ),

    toFirstUpper: ({ value: v }) => {
        const s = String(v);
        return value(s === "" ? s : s.charAt(0).toUpperCase() + s.slice(1));
    },

    toSnakeCase: ({ value: v }) =>
        value(String(v).replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase()),

    toPackage: ({ value: v }) =>
        value(String(v).replace(/\./g, "/")),

    default: ({ value: v, params }) =>
        value(v !== undefined && v !== null ? v : params[0]),
});