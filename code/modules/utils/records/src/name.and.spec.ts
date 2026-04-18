import {
    frozenEmptyObject,
    invertObject,
    mapObject,
    mutableEmptyObject,
    type NameAnd,
} from './name.and'

describe('empty object constants', () => {
    it('mutableEmptyObject starts empty', () => {
        expect(mutableEmptyObject).toEqual({})
    })

    it('mutableEmptyObject is not frozen', () => {
        expect(Object.isFrozen(mutableEmptyObject)).toBe(false)
    })

    it('frozenEmptyObject starts empty', () => {
        expect(frozenEmptyObject).toEqual({})
    })

    it('frozenEmptyObject is frozen', () => {
        expect(Object.isFrozen(frozenEmptyObject)).toBe(true)
    })

    it('frozenEmptyObject cannot be mutated', () => {
        expect(() => {
            ;(frozenEmptyObject as any).x = 'value'
        }).toThrow()
    })
})

describe('invertObject', () => {
    it('inverts simple string values', () => {
        expect(
            invertObject({
                jira: 'platform',
                sap: 'finance',
            }),
        ).toEqual({
            platform: 'jira',
            finance: 'sap',
        })
    })

    it('inverts array values', () => {
        expect(
            invertObject({
                mygenius: ['training', 'mygenius'],
                jira: 'jira',
            }),
        ).toEqual({
            training: 'mygenius',
            mygenius: 'mygenius',
            jira: 'jira',
        })
    })

    it('returns empty object for empty input', () => {
        expect(invertObject({})).toEqual({})
    })

    it('last value wins on collisions from simple values', () => {
        expect(
            invertObject({
                a: 'x',
                b: 'x',
            }),
        ).toEqual({ x: 'b' })
    })

    it('last value wins on collisions involving arrays', () => {
        expect(
            invertObject({
                a: ['x', 'y'],
                b: ['y', 'z'],
            }),
        ).toEqual({
            x: 'a',
            y: 'b',
            z: 'b',
        })
    })
})

describe('mapObject', () => {
    it('maps values and preserves keys', () => {
        expect(
            mapObject(
                {
                    a: 1,
                    b: 2,
                },
                v => v * 10,
            ),
        ).toEqual({
            a: 10,
            b: 20,
        })
    })

    it('passes value, name and index to mapper', () => {
        expect(
            mapObject(
                {
                    a: 10,
                    b: 20,
                    c: 30,
                },
                (value, name, index) => `${index}:${name}=${value}`,
            ),
        ).toEqual({
            a: '0:a=10',
            b: '1:b=20',
            c: '2:c=30',
        })
    })

    it('returns empty object for empty input', () => {
        expect(mapObject({}, v => v)).toEqual({})
    })

    it('supports explicit NameAnd typing', () => {
        const input: NameAnd<number> = { one: 1, two: 2 }
        const result = mapObject(input, value => value.toString())
        expect(result).toEqual({ one: '1', two: '2' })
    })
})