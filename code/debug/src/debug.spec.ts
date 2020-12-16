import {addDebug, DebugPrinter} from "./debug";

let context = {"some": "stuff"}

function remember(array: any[][]): DebugPrinter { return x => array.push(x)}
describe("Debugging", () => {
    describe("addDebug", () => {
        it("should not change original object, and should have copied the original adding a debug", () => {
            let contextWithDebug = addDebug("one", x => {})(context)
            expect(context).toEqual({"some": "stuff"})
            expect(contextWithDebug.some).toBe("stuff")
            expect(typeof contextWithDebug.debug).toEqual('function')
        })
    })

    describe('message', () => {
        it('should print a message if the section is enabled', () => {
            let remembered: any[][] = [];
            let one = addDebug("one", remember(remembered))(context).debug('one')
            one.message(() => ['some', 'text'])
            one.message(() => ['more', 'text'])
            expect(remembered).toEqual([["some", "text"], ["more", "text"]])
        })
        it('should not print a message if the section is not enabled', () => {
            let remembered: any[][] = [];
            let one = addDebug("two", remember(remembered))(context).debug('one')
            one.message(() => ['some', 'text'])
            one.message(() => ['more', 'text'])
            expect(remembered).toEqual([])
        })
    })

    describe('k', () => {
        let someError = new Error('some error');
        it('should return the promise and print a message if the section is enabled', async () => {
            let remembered: any[][] = [];
            let one = addDebug("one", remember(remembered))(context).debug('one')
            let result = one.k(() => 'some message', () => Promise.resolve('some result'))
            result.then(res => {
                expect(res).toEqual('some resulta')
                expect(remembered).toEqual([["some", "text"], ["more", "text"]])
            })
        })
        it('should print an error message if the section is enabled', async () => {
            let remembered: any[][] = [];
            let one = addDebug("one", remember(remembered))(context).debug('one')
            let result = one.k(() => 'some message', () => Promise.reject(someError))
            return result.then(r => fail(r), e => {
                expect(e).toEqual(someError)
                expect(remembered.length).toEqual(1)
                expect(remembered[0]).toEqual(["one", "error executing ", "some message", someError])
            })
        })
        it('should not print a message if the section is not enabled', async () => {
            let remembered: any[][] = [];
            let one = addDebug("two", remember(remembered))(context).debug('one')
            return one.k(() => 'some message', () => Promise.resolve('some result')).//
                then(res => {
                    expect(res).toEqual('some result')
                    expect(remembered).toEqual([])
                })
        })
    })
})