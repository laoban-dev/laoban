import {Validate} from "./validation";

interface Test {
    a: string,
    b: number,
    c: Child,
    d: Child[]
}
interface Child {
    c1: string
}

describe("Validation", () => {

    it('allows simple field validations when everything oK', () => {
        expect(Validate.validate('root', {a: 1, b: 2}).isNumber('a').isNumber('b').errors).toEqual([])
        expect(Validate.validate('root', {a: "one", b: "two"}).isString('a').isString('b').errors).toEqual([])
    })

    it('allows simple field validations when errors', () => {
        expect(Validate.validate('root', {a: 1, b: 2}).isNumber('a').isString('b').errors).toEqual(['root.b should be a string'])
        expect(Validate.validate('root', {a: "one", b: "two"}).isNumber('a').isString('b').errors).toEqual(['root.a should be a number'])
    })

    it('allows child objects to be validated - when child not present', () => {
        let ab: any = {a: "one", b: "two"};
        let t: Test = ab;
        expect(Validate.validate('root', t).isObject('c', vc => vc.isString('c1')).errors).toEqual(['root.c should be an object'])

    })
    it('allows child objects to be validated - when child present but wrong', () => {
        let ab: any = {a: "one", b: "two", c: {c1: 1}};
        let t: Test = ab;
        expect(Validate.validate('root', t).isObject('c', vc => vc.isString('c1')).errors).toEqual(['root.c.c1 should be a string'])
    })
    it('allows child arrays of arrays to be validated, when not present', () => {
        let ab: any = {a: "one", b: "two"};
        let t: Test = ab;
        expect(Validate.validate('root', t).isArrayofObjects<Child>('d', (vc) =>
            vc.isString('c1')).errors).toEqual(['root.d is not an array'])
    })
    it('allows child arrays of arrays to be validated, when not array ', () => {
        let ab: any = {a: "one", b: "two", d: 1};
        let t: Test = ab;
        expect(Validate.validate('root', t).isArrayofObjects<Child>('d', vc => vc.isString('c1')).errors).toEqual(['root.d is not an array'])
    })
    it('allows child arrays of objects to be validated ', () => {
        let ab: any = {a: "one", b: "two", d: [{c1: 1}, {c1: "s"}, {}, {c1: {}}]};
        let t: Test = ab;
        expect(Validate.validate('root', t).isArrayofObjects<Child>('d', vc => vc.isString('c1')).errors).toEqual([
            "root.d[0].c1 should be a string",
            "root.d[2].c1 should be a string",
            "root.d[3].c1 should be a string"])
    })
    it (' allows objects of obejcts to be validated ', () =>{
        fail()
    })
})