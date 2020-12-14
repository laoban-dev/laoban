export let dummy=''
// //This will vanish to the validation project as soon as I work out how to do the linking properly
//
// import * as fs from "fs";
//
// function isType<T>(t: T, expected: string) { return typeof t == expected}
// function reasonString(reason: string) {
//     return reason ? ' ' + reason : '';
// }
// /** Usage
//  * Validate(x).isString('name').isString('otherField').errors   // returns a string[]  with the result of validating that name is a string field on x, as is otherField
//  * Validate(x).isObject('y', vy => vy.isString('yname1').isString('yName2')).errors // checks that x has an object y, and that y has two string fields yname1 and ynames2
//  */
// export class Validate<T> {
//     static validate<T>(context: string, t: T, debug: boolean = false): Validate<T> {return new Validate<T>(context, t, [], debug)}
//     static validateFile<T>(context: string, filename: string, fn: (v: Validate<T>) => void, debug: boolean = false): Promise<string[]> {
//         return new Promise((resolve, reject) => fs.readFile(filename, (err, data) => {
//             if (err) {
//                 resolve([`${context} Cannot load file ${filename}`])
//             } else {
//                 try {
//                     let v = new Validate<T>(context, JSON.parse(data.toString()), [], debug)
//                     fn(v)
//                     resolve(v.errors)
//                 } catch (e) {
//                     resolve([`${context} Cannot parse json at file ${filename}\n${e}`])
//                 }
//                 resolve([])
//             }
//         }))
//     }
//     static validateDirectoryExists(context: string, dir: string): Promise<string[]> {
//         function error() { return [`${context} ${dir} does not exist`]}
//         return new Promise<string[]>(resolve =>
//             fs.lstat(dir, (e, stats) => {
//                 if (e) resolve(error()); else resolve(stats.isDirectory() ? [] : error())
//             }))
//     }
//
//     private context: string
//     t: T
//     errors: string[]
//     validationDebug: boolean
//
//     constructor(context: string, t: T, errors: string[], validationDebug: boolean) {
//         this.context = context;
//         this.t = t;
//         this.errors = errors
//         this.validationDebug = validationDebug;
//     }
//
//     optIs = (type: string): <K extends keyof T>(fieldName: K) => Validate<T> => fieldName => this.t[fieldName] ? this.checkIs(type)(fieldName) : this;
//     isString = this.checkIs('string')
//     isBoolean = this.checkIs('boolean')
//     isNumber = this.checkIs('number')
//     isOptString = this.optIs('string')
//     isOptNumber = this.optIs('number')
//
//     private error(s: string) {
//         if (this.validationDebug) console.log('validation.error', this.context, s)
//         this.errors.push(s)
//         return this
//     }
//
//     addErrors<T1>(errors: string[]) {
//         this.errors = [...this.errors, ...errors]
//         return this
//     }
//     private _checkIs<K extends keyof T>(type: string, fieldName: K): boolean {return this.t[fieldName] ? typeof this.t[fieldName] == type : false;}
//
//     checkIs(type: string): <K extends keyof T>(fieldName: K, reason?: string) => Validate<T> {
//         return (fieldName, reason) => {
//             if (!this._checkIs(type, fieldName)) this.error(`${this.context}.${fieldName} should be a ${type}.${reasonString(reason)}`)
//             return this
//         }
//     }
//
//     isObject<K extends keyof T>(fieldName: K, fn: (v: Validate<T[K]>) => void, reason? : string): Validate<T> {
//         let element: any = this.t[fieldName]
//         if (this._checkIs('object', fieldName)) this.checkChildObject(this.context + '.' + fieldName, element, fn);
//         else this.error(`${this.context}.${fieldName} should be an object.${reasonString(reason)}`)
//         return this
//     }
//     optObject = <K extends keyof T>(fieldName: K, fn: (v: Validate<T[K]>) => void, reason?: string): Validate<T> =>
//         this.t[fieldName] ? this.isObject(fieldName, fn, reason) : this;
//
//     private checkChildObject<T1>(newContext: string, newT: T1, fn: (v: Validate<T1>) => void): Validate<T> {
//         let validationObject = new Validate<T1>(newContext, newT, [], this.validationDebug);
//         fn(validationObject)
//         return this.addErrors(validationObject.errors)
//     }
//
//     isArrayofObjects<T1>(fieldName: string, fn: (v: Validate<T1>) => void) {
//         let element: any = this.t[fieldName];
//         let array: any[] = element
//         let newContext = this.context + '.' + fieldName
//         if (Array.isArray(array))
//             array.forEach((t, i) => this.checkChildObject(`${newContext}[${i}]`, array[i], fn))
//         else this.error(`${this.context}.${fieldName} is not an array`)
//         return this
//     }
//     isObjectofObjects<T1>(fieldName: string, fn: (v: Validate<T1>) => void): Validate<T> {
//         let element: any = this.t[fieldName];
//         let newContext = this.context + '.' + fieldName
//         return this._checkIs('object', <any>fieldName) ?
//             Object.keys(element).sort().reduce((acc, key) => acc.checkChildObject(`${newContext}.${key}`, element[key], fn), this) :
//             this.error(`${this.context}.${fieldName} is not an object`);
//     }
// }
//
