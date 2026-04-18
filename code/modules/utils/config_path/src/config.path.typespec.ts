

// ----- tiny assertion helpers -----
import {ConfigPath, ConfigPathValue} from "./config.path";

type Equal<A, B> =
    (<T>() => T extends A ? 1 : 2) extends
        (<T>() => T extends B ? 1 : 2) ? true : false;

type Expect<T extends true> = T;

// ----- fixtures -----
type Person = {
    name: string;
    address?: {
        postcode?: string;
        country?: { code: string };
    };
    tags: string[]; // arrays are leafs
};

type NestedOptional = {
    a?: {
        b?: {
            c: string;
            d?: { e: number };
        };
    };
};

// union shortcut: either string shortcut or complex object
type Shortcut = {
    a?: string | { b?: { c: string } };
};

// union of object shapes
type UnionObjects = {
    a?: { b: { c: string } } | { x: number };
};

// ----- positives: basic + optionals -----
type _p1 = Expect<Equal<("name" extends ConfigPath<Person> ? true : false), true>>;
type _p2 = Expect<Equal<("address.postcode" extends ConfigPath<Person> ? true : false), true>>;
type _p3 = Expect<Equal<("address.country.code" extends ConfigPath<Person> ? true : false), true>>;
type _p4 = Expect<Equal<("tags" extends ConfigPath<Person> ? true : false), true>>;

type _p5 = Expect<Equal<("a.b.c" extends ConfigPath<NestedOptional> ? true : false), true>>;
type _p6 = Expect<Equal<("a.b.d.e" extends ConfigPath<NestedOptional> ? true : false), true>>;

// ----- negatives: typos + arrays -----
type _n1 = Expect<Equal<("nope" extends ConfigPath<Person> ? true : false), false>>;
type _n2 = Expect<Equal<("address.nope" extends ConfigPath<Person> ? true : false), false>>;
type _n3 = Expect<Equal<("address.country.nope" extends ConfigPath<Person> ? true : false), false>>;
type _n4 = Expect<Equal<("tags.0" extends ConfigPath<Person> ? true : false), false>>;
type _n5 = Expect<Equal<("a.b.d.nope" extends ConfigPath<NestedOptional> ? true : false), false>>;

// ----- unions: permissive semantics (ANY branch) -----
type _u1 = Expect<Equal<("a" extends ConfigPath<Shortcut> ? true : false), true>>;
type _u2 = Expect<Equal<("a.b.c" extends ConfigPath<Shortcut> ? true : false), true>>;

type _u3 = Expect<Equal<("a.b.c" extends ConfigPath<UnionObjects> ? true : false), true>>;
type _u4 = Expect<Equal<("a.x" extends ConfigPath<UnionObjects> ? true : false), true>>;

// ----- ConfigPathValue tests -----
type _v1 = Expect<Equal<ConfigPathValue<Person, "name">, string>>;
type _v2 = Expect<Equal<ConfigPathValue<Person, "address.postcode">, string>>;
type _v3 = Expect<Equal<ConfigPathValue<NestedOptional, "a.b.d.e">, number>>;
type _v4 = Expect<Equal<ConfigPathValue<Person, "tags">, string[]>>;

// ----- readable assignment checks -----
declare const p: ConfigPath<Person>;
const ok1: typeof p = "address.country.code";

// @ts-expect-error typo should fail
const bad1: typeof p = "address.country.nope";

// @ts-expect-error no numeric segments
const bad2: typeof p = "tags.0";

declare const s: ConfigPath<Shortcut>;
const ok2: typeof s = "a.b.c"; // allowed due to shortcut union semantics
