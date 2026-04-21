import {
    chainValidators,
    combineValidators,
    ifPresent,
    mustBeArrayOf,
    mustBeBoolean,
    mustBeNameAndIfPresent,
    mustBeObjectWithFields,
    mustBeString,
    nonBlank,
    type Validator
} from "@laoban/validation";
import {type PackageDetails} from "./package.details";

export const validatePackageDetails: Validator<PackageDetails> =
    mustBeObjectWithFields<PackageDetails>({
        template: chainValidators(mustBeString, nonBlank),
        name: chainValidators(mustBeString, nonBlank),
        description: ifPresent(chainValidators(mustBeString, nonBlank)),
        links: ifPresent(mustBeArrayOf(chainValidators(mustBeString, nonBlank))),
        devLinks: ifPresent(mustBeArrayOf(chainValidators(mustBeString, nonBlank))),
        peerLinks: ifPresent(mustBeArrayOf(chainValidators(mustBeString, nonBlank))),
        guards: mustBeNameAndIfPresent(mustBeBoolean),
        files: ifPresent(mustBeObjectWithFields<Record<string, any>>({})),
        meta: ifPresent(mustBeObjectWithFields<Record<string, any>>({}))
    }, true);